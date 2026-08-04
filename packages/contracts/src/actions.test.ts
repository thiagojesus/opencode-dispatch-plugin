import { describe, expect, test } from "bun:test"

import {
  MAX_PROMPT_BYTES,
  PermissionDecisionSchema,
  PromptRequestSchema,
  RemoteActionRequestSchema,
  remoteActionSessionId,
} from "./index.ts"

const IDEMPOTENCY_KEY = "550e8400-e29b-41d4-a716-446655440001"
const SESSION_ID = "ses_contracts"

describe("remote action contracts", () => {
  test("parses a text-only idempotent prompt request", () => {
    const givenRequest = {
      type: "prompt",
      version: 1,
      sessionId: SESSION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      text: "Continue the verified task.",
    }

    const parsedRequest = PromptRequestSchema.parse(givenRequest)

    expect(JSON.stringify(parsedRequest)).toBe(JSON.stringify(givenRequest))
  })

  test("rejects a prompt larger than 32 KiB", () => {
    const givenRequest = {
      type: "prompt",
      version: 1,
      sessionId: SESSION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      text: "a".repeat(MAX_PROMPT_BYTES + 1),
    }

    const parsedRequest = PromptRequestSchema.safeParse(givenRequest)

    expect(parsedRequest.success).toBe(false)
  })

  test("measures the prompt limit in UTF-8 bytes rather than characters", () => {
    const givenRequest = {
      type: "prompt",
      version: 1,
      sessionId: SESSION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      text: "😀".repeat(MAX_PROMPT_BYTES / 4 + 1),
    }

    const parsedRequest = PromptRequestSchema.safeParse(givenRequest)

    expect(parsedRequest.success).toBe(false)
  })

  test("accepts exactly once and reject permission decisions", () => {
    const givenDecisions = ["once", "reject"]

    const parsedDecisions = givenDecisions.map((decision) =>
      PermissionDecisionSchema.parse(decision),
    )

    expect(parsedDecisions.join(",")).toBe("once,reject")
  })

  test("rejects the upstream always permission decision", () => {
    const givenDecision = "always"

    const parsedDecision = PermissionDecisionSchema.safeParse(givenDecision)

    expect(parsedDecision.success).toBe(false)
  })

  test("rejects an unknown remote action discriminator", () => {
    const givenRequest = {
      type: "shell",
      version: 1,
      sessionId: SESSION_ID,
      command: "pwd",
    }

    const parsedRequest = RemoteActionRequestSchema.safeParse(givenRequest)

    expect(parsedRequest.success).toBe(false)
  })

  test("exhaustively resolves the session for each permitted action", () => {
    const givenRequests = [
      {
        type: "prompt",
        version: 1,
        sessionId: SESSION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        text: "Continue.",
      },
      { type: "abort", version: 1, sessionId: SESSION_ID },
      {
        type: "permission_reply",
        version: 1,
        sessionId: SESSION_ID,
        requestId: "perm_contracts",
        decision: "once",
      },
      {
        type: "question_reply",
        version: 1,
        sessionId: SESSION_ID,
        requestId: "question_contracts",
        answers: [["Ship"]],
      },
    ].map((request) => RemoteActionRequestSchema.parse(request))

    const sessionIds = givenRequests.map(remoteActionSessionId)

    expect(sessionIds.join(",")).toBe(Array.from({ length: 4 }, () => SESSION_ID).join(","))
  })
})
