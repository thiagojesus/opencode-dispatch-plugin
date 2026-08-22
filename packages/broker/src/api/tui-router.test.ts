import { describe, expect, test } from "bun:test"

import { createInternalAuthResponse } from "../security/index.ts"
import { createBrokerHttpRouter } from "./index.ts"
import {
  FakeCluster,
  FakeOpenCode,
  routerOptions,
  SECOND_SESSION_ID,
  SESSION_ID,
  STABLE_ORIGIN,
  trustedHeaders,
} from "./test-support.ts"

const CHALLENGE_PATH = "/.well-known/opencode-dispatch/tui/challenge"
const CONTROL_PATH = "/.well-known/opencode-dispatch/tui/control"

type Challenge = {
  readonly issuedAtMs: number
  readonly nonce: string
}

function localRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`http://127.0.0.1:43110${path}`, init)
}

async function challengeFor(router: ReturnType<typeof createBrokerHttpRouter>): Promise<Challenge> {
  const response = await router.handle(localRequest(CHALLENGE_PATH), "direct")
  const body: unknown = await response.json()
  if (
    typeof body !== "object" ||
    body === null ||
    !("challenge" in body) ||
    typeof body.challenge !== "object" ||
    body.challenge === null ||
    !("issuedAtMs" in body.challenge) ||
    typeof body.challenge.issuedAtMs !== "number" ||
    !("nonce" in body.challenge) ||
    typeof body.challenge.nonce !== "string"
  ) {
    throw new TypeError("Expected a TUI challenge response.")
  }
  return { issuedAtMs: body.challenge.issuedAtMs, nonce: body.challenge.nonce }
}

function controlRequest(
  auth: ReturnType<typeof createInternalAuthResponse>,
  operation: unknown,
): Request {
  return localRequest(CONTROL_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: 1, auth, operation }),
  })
}

describe("authenticated loopback TUI composition", () => {
  test("serves the strict status snapshot without transmitting the host secret", async () => {
    const cluster = new FakeCluster()
    const openCode = new FakeOpenCode()
    const options = routerOptions(cluster, openCode)
    const router = createBrokerHttpRouter(options)
    const challenge = await challengeFor(router)
    const auth = createInternalAuthResponse(
      options.hostSecret,
      challenge,
      "dispatch.tui.control:v1",
    )

    const response = await router.handle(controlRequest(auth, { type: "status" }), "direct")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      type: "dispatch_tui_snapshot",
      version: 1,
      snapshot: {
        connected: true,
        sessions: [
          { id: SESSION_ID, live: true, enabled: true },
          { id: SECOND_SESSION_ID, live: true, enabled: false },
        ],
        tailscale: { kind: "ready", stableUrl: STABLE_ORIGIN },
        diagnostics: { broker: "connected", registration: "live" },
      },
    })
    expect(JSON.stringify(body)).not.toContain(options.hostSecret.serialize())
    expect(JSON.stringify(body)).not.toContain("allowedLogin")
    expect(JSON.stringify(body)).not.toContain("machineName")
  })

  test("enables and disables only the authenticated current session idempotently", async () => {
    const cluster = new FakeCluster()
    const openCode = new FakeOpenCode()
    const options = routerOptions(cluster, openCode)
    const router = createBrokerHttpRouter(options)
    const invoke = async (operation: unknown): Promise<Response> => {
      const challenge = await challengeFor(router)
      const auth = createInternalAuthResponse(
        options.hostSecret,
        challenge,
        "dispatch.tui.control:v1",
      )
      return router.handle(controlRequest(auth, operation), "direct")
    }

    const firstEnable = await invoke({
      type: "enable",
      sessionId: SECOND_SESSION_ID,
      title: "Secondary session",
    })
    const secondEnable = await invoke({
      type: "enable",
      sessionId: SECOND_SESSION_ID,
      title: "Secondary session",
    })
    const firstDisable = await invoke({ type: "disable", sessionId: SECOND_SESSION_ID })
    const secondDisable = await invoke({ type: "disable", sessionId: SECOND_SESSION_ID })

    expect([
      firstEnable.status,
      secondEnable.status,
      firstDisable.status,
      secondDisable.status,
    ]).toEqual([200, 200, 200, 200])
    expect(cluster.exposures.map((candidate) => candidate.sessionId)).toEqual([SESSION_ID])
  })

  test("consumes a challenge once and rejects replay without another operation", async () => {
    const cluster = new FakeCluster()
    const options = routerOptions(cluster, new FakeOpenCode())
    const router = createBrokerHttpRouter(options)
    const challenge = await challengeFor(router)
    const auth = createInternalAuthResponse(
      options.hostSecret,
      challenge,
      "dispatch.tui.control:v1",
    )
    const requestBody = JSON.stringify({ version: 1, auth, operation: { type: "status" } })

    const first = await router.handle(
      localRequest(CONTROL_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
      }),
      "direct",
    )
    const replay = await router.handle(
      localRequest(CONTROL_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
      }),
      "direct",
    )

    expect(first.status).toBe(200)
    expect(replay.status).toBe(401)
    expect(await replay.json()).toEqual({ code: "control_rejected" })
  })

  test.each([
    [CHALLENGE_PATH, "POST", undefined, 405],
    [CONTROL_PATH, "GET", undefined, 405],
    [CONTROL_PATH, "POST", "text/plain", 415],
  ] as const)(
    "rejects invalid local method or media case %#",
    async (path, method, contentType, status) => {
      const headers = new Headers()
      if (contentType !== undefined) headers.set("content-type", contentType)
      const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), new FakeOpenCode()))

      const response = await router.handle(
        localRequest(path, { method, headers, body: method === "POST" ? "{}" : null }),
        "direct",
      )

      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ code: "control_rejected" })
    },
  )

  test("rejects Tailscale-proxied access to the local challenge endpoint", async () => {
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), new FakeOpenCode()))

    const response = await router.handle(
      new Request(`${STABLE_ORIGIN}${CHALLENGE_PATH}`, { headers: trustedHeaders() }),
      "trusted_proxy",
    )

    expect(response.status).toBe(404)
  })

  test("returns 410 from the remote facade immediately after local disable", async () => {
    const cluster = new FakeCluster()
    const options = routerOptions(cluster, new FakeOpenCode())
    const router = createBrokerHttpRouter(options)
    const challenge = await challengeFor(router)
    const auth = createInternalAuthResponse(
      options.hostSecret,
      challenge,
      "dispatch.tui.control:v1",
    )
    await router.handle(controlRequest(auth, { type: "disable", sessionId: SESSION_ID }), "direct")

    const remote = await router.handle(
      new Request(`${STABLE_ORIGIN}/api/v1/sessions/${SESSION_ID}`, {
        headers: trustedHeaders(),
      }),
      "trusted_proxy",
    )

    expect(remote.status).toBe(410)
    expect(JSON.stringify(await remote.json())).toContain("SESSION_GONE")
  })
})
