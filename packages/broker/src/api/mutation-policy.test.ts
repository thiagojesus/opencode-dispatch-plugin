import { describe, expect, test } from "bun:test"

import { createBrokerHttpRouter } from "./index.ts"
import {
  FakeCluster,
  FakeOpenCode,
  IDEMPOTENCY_KEY,
  routerOptions,
  SECOND_IDEMPOTENCY_KEY,
  SESSION_ID,
  STABLE_ORIGIN,
  trustedHeaders,
} from "./test-support.ts"

function actionRequest(body: unknown): Request {
  const headers = trustedHeaders()
  headers.set("content-type", "application/json")
  return new Request(`${STABLE_ORIGIN}/api/v1/actions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

function promptBody(idempotencyKey = IDEMPOTENCY_KEY): Readonly<Record<string, unknown>> {
  return {
    type: "prompt",
    version: 1,
    sessionId: SESSION_ID,
    idempotencyKey,
    text: "Continue the verified task.",
  }
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

describe("remote mutation policy", () => {
  test("rejects the persistent permission decision before an upstream call", async () => {
    const openCode = new FakeOpenCode()
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), openCode))

    const response = await router.handle(
      actionRequest({
        type: "permission_reply",
        version: 1,
        sessionId: SESSION_ID,
        requestId: "perm-api",
        decision: "always",
      }),
      "trusted_proxy",
    )

    expect(response.status).toBe(400)
    expect(openCode.permissionCalls).toBe(0)
  })

  test("enforces a per-identity and session mutation rate limit", async () => {
    const openCode = new FakeOpenCode()
    const options = routerOptions(new FakeCluster(), openCode)
    const router = createBrokerHttpRouter({
      ...options,
      rateLimit: { maxSubjects: 4, mutationLimit: 1, readLimit: 4, windowMs: 60_000 },
    })
    await router.handle(actionRequest(promptBody()), "trusted_proxy")

    const response = await router.handle(
      actionRequest(promptBody(SECOND_IDEMPOTENCY_KEY)),
      "trusted_proxy",
    )

    expect(response.status).toBe(429)
    expect(await responseCode(response)).toBe("RATE_LIMITED")
    expect(openCode.promptCalls).toBe(1)
  })
})
