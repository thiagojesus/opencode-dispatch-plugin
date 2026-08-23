import { describe, expect, test } from "bun:test"

import { createBrokerHttpRouter } from "./index.ts"
import {
  FakeCluster,
  FakeOpenCode,
  routerOptions,
  SECOND_PROCESS_NONCE,
  SESSION_ID,
  STABLE_ORIGIN,
  trustedHeaders,
} from "./test-support.ts"

function actionRequest(body: Readonly<Record<string, unknown>>): Request {
  const headers = trustedHeaders()
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

describe("remote mutation owner races", () => {
  test("does not reply to permission after ownership flips during pending-state read", async () => {
    const openCode = new FakeOpenCode()
    openCode.onPermissions = () => {
      openCode.owner = SECOND_PROCESS_NONCE
    }
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), openCode))

    const response = await router.handle(
      actionRequest({
        type: "permission_reply",
        version: 1,
        sessionId: SESSION_ID,
        requestId: "perm-api",
        decision: "once",
      }),
      "trusted_proxy",
    )

    expect(response.status).toBe(409)
    expect(await responseCode(response)).toBe("OWNERSHIP_CONFLICT")
    expect(openCode.permissionCalls).toBe(0)
  })

  test("does not reply to question after ownership flips during pending-state read", async () => {
    const openCode = new FakeOpenCode()
    openCode.onQuestions = () => {
      openCode.owner = SECOND_PROCESS_NONCE
    }
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), openCode))

    const response = await router.handle(
      actionRequest({
        type: "question_reply",
        version: 1,
        sessionId: SESSION_ID,
        requestId: "question-api",
        answers: [["Continue"]],
      }),
      "trusted_proxy",
    )

    expect(response.status).toBe(409)
    expect(await responseCode(response)).toBe("OWNERSHIP_CONFLICT")
    expect(openCode.questionCalls).toBe(0)
  })
})
