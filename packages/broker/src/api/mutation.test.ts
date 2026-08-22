import { describe, expect, test } from "bun:test"

import { CONTROL_CAPABILITY } from "@opencode-dispatch/contracts"

import { createBrokerHttpRouter } from "./index.ts"
import {
  exposure,
  FakeCluster,
  FakeOpenCode,
  IDEMPOTENCY_KEY,
  LOGIN,
  NOW,
  routerOptions,
  SECOND_PROCESS_NONCE,
  SECOND_SESSION_ID,
  SESSION_ID,
  STABLE_ORIGIN,
  trustedHeaders,
} from "./test-support.ts"

function actionRequest(body: unknown, login = LOGIN): Request {
  const headers = trustedHeaders(login)
  headers.set("content-type", "application/json")
  return new Request(`${STABLE_ORIGIN}/api/v1/actions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

async function responseCode(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json()
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "code" in body.error &&
    typeof body.error.code === "string"
  ) {
    return body.error.code
  }
  return undefined
}

function promptBody(
  idempotencyKey = IDEMPOTENCY_KEY,
  sessionId = SESSION_ID,
): Readonly<Record<string, unknown>> {
  return {
    type: "prompt",
    version: 1,
    sessionId,
    idempotencyKey,
    text: "Continue the verified task.",
  }
}

describe("remote mutation authority and idempotence", () => {
  test("returns the original prompt result on replay and calls OpenCode exactly once", async () => {
    const openCode = new FakeOpenCode()
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), openCode))

    const first = await router.handle(actionRequest(promptBody()), "trusted_proxy")
    const second = await router.handle(actionRequest(promptBody()), "trusted_proxy")
    const firstBody = await first.json()
    const secondBody = await second.json()

    expect(first.status).toBe(202)
    expect(second.status).toBe(202)
    expect(firstBody).toMatchObject({
      type: "prompt_accepted",
      sessionId: SESSION_ID,
      acceptedAt: NOW,
      duplicate: false,
    })
    expect(secondBody).toEqual({ ...firstBody, duplicate: true })
    expect(openCode.promptCalls).toBe(1)
  })

  test("does not expose a cached result to another Tailscale identity", async () => {
    const openCode = new FakeOpenCode()
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), openCode))
    await router.handle(actionRequest(promptBody()), "trusted_proxy")
    const attackerHeaders = new Headers({
      host: "workstation.example.ts.net",
      origin: STABLE_ORIGIN,
      "tailscale-app-capabilities": JSON.stringify({ [CONTROL_CAPABILITY]: [{}] }),
      "tailscale-user-login": "attacker@example.test",
      "content-type": "application/json",
    })

    const response = await router.handle(
      new Request(`${STABLE_ORIGIN}/api/v1/actions`, {
        method: "POST",
        headers: attackerHeaders,
        body: JSON.stringify(promptBody()),
      }),
      "trusted_proxy",
    )

    expect(response.status).toBe(401)
    expect(await responseCode(response)).toBe("IDENTITY_MISMATCH")
    expect(openCode.promptCalls).toBe(1)
  })

  test("scopes the same idempotency key to the authoritative process and session", async () => {
    const cluster = new FakeCluster()
    const openCode = new FakeOpenCode()
    const router = createBrokerHttpRouter(routerOptions(cluster, openCode))
    await router.handle(actionRequest(promptBody()), "trusted_proxy")
    const templateMember = cluster.members[0]
    if (templateMember === undefined) throw new TypeError("Expected a cluster member fixture.")
    cluster.members.push({
      processNonce: SECOND_PROCESS_NONCE,
      serverUrl: templateMember.serverUrl,
      pid: templateMember.pid,
      startedAt: templateMember.startedAt,
      lastSeenAt: NOW,
      expiresAt: NOW + 15_000,
    })
    cluster.exposures = [exposure(SECOND_SESSION_ID, SECOND_PROCESS_NONCE)]
    openCode.owner = SECOND_PROCESS_NONCE

    const response = await router.handle(
      actionRequest(promptBody(IDEMPOTENCY_KEY, SECOND_SESSION_ID)),
      "trusted_proxy",
    )

    expect(response.status).toBe(202)
    expect(openCode.promptCalls).toBe(2)
  })

  test("returns gone when disable occurs after the upstream prompt starts", async () => {
    const cluster = new FakeCluster()
    const openCode = new FakeOpenCode()
    const started = Promise.withResolvers<void>()
    const gate = Promise.withResolvers<void>()
    openCode.onPrompt = started.resolve
    openCode.promptGate = gate.promise
    const router = createBrokerHttpRouter(routerOptions(cluster, openCode))

    const pending = router.handle(actionRequest(promptBody()), "trusted_proxy")
    await started.promise
    cluster.exposures = []
    gate.resolve()
    const response = await pending

    expect(response.status).toBe(410)
    expect(await responseCode(response)).toBe("SESSION_GONE")
    expect(openCode.promptCalls).toBe(1)
  })

  test.each([
    ["ownership_missing", 410, "SESSION_GONE"],
    ["ownership_ambiguous", 409, "OWNERSHIP_AMBIGUOUS"],
  ] as const)("maps %s to the required typed status", async (failure, status, code) => {
    const openCode = new FakeOpenCode()
    openCode.ownerFailure = failure
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), openCode))

    const response = await router.handle(actionRequest(promptBody()), "trusted_proxy")

    expect(response.status).toBe(status)
    expect(await responseCode(response)).toBe(code)
    expect(openCode.promptCalls).toBe(0)
  })

  test("maps upstream failure to 503 without exposing its error content", async () => {
    const openCode = new FakeOpenCode()
    openCode.upstreamFailure = true
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), openCode))

    const response = await router.handle(actionRequest(promptBody()), "trusted_proxy")
    const serialized = JSON.stringify(await response.json())

    expect(response.status).toBe(503)
    expect(serialized).toContain("UPSTREAM_UNAVAILABLE")
    expect(serialized).not.toContain("stack")
    expect(serialized).not.toContain("Continue the verified task")
  })

  test("validates current pending IDs before permission and question replies", async () => {
    const openCode = new FakeOpenCode()
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), openCode))
    const permission = await router.handle(
      actionRequest({
        type: "permission_reply",
        version: 1,
        sessionId: SESSION_ID,
        requestId: "perm-stale",
        decision: "once",
      }),
      "trusted_proxy",
    )
    const question = await router.handle(
      actionRequest({
        type: "question_reply",
        version: 1,
        sessionId: SESSION_ID,
        requestId: "question-stale",
        answers: [["Continue"]],
      }),
      "trusted_proxy",
    )

    expect(permission.status).toBe(409)
    expect(question.status).toBe(409)
    expect(openCode.permissionCalls + openCode.questionCalls).toBe(0)
  })

  test("forwards every allowed mutation exactly once through the authoritative owner", async () => {
    const openCode = new FakeOpenCode()
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), openCode))
    const requests = [
      promptBody(),
      { type: "abort", version: 1, sessionId: SESSION_ID },
      {
        type: "permission_reply",
        version: 1,
        sessionId: SESSION_ID,
        requestId: "perm-api",
        decision: "reject",
      },
      {
        type: "question_reply",
        version: 1,
        sessionId: SESSION_ID,
        requestId: "question-api",
        answers: [["Continue"]],
      },
    ]

    const responses = await Promise.all(
      requests.map((request) => router.handle(actionRequest(request), "trusted_proxy")),
    )

    expect(responses.map((response) => response.status)).toEqual([202, 202, 202, 202])
    expect({
      prompt: openCode.promptCalls,
      abort: openCode.abortCalls,
      permission: openCode.permissionCalls,
      question: openCode.questionCalls,
    }).toEqual({ prompt: 1, abort: 1, permission: 1, question: 1 })
  })
})
