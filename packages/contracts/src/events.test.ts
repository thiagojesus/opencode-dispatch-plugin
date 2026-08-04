import { describe, expect, test } from "bun:test"

import {
  MAX_EVENT_BATCH_SIZE,
  MAX_PUBLIC_PAYLOAD_BYTES,
  NormalizedEventEnvelopeSchema,
  NormalizedEventSequenceSchema,
  normalizedEventSessionId,
} from "./index.ts"

const BROKER_EPOCH = "550e8400-e29b-41d4-a716-446655440003"
const NOW = 1_754_352_000_000
const SESSION_ID = "ses_contracts"

const sessionSummary = {
  id: SESSION_ID,
  title: "Contract session",
  status: { type: "busy" },
  enabledAt: NOW,
  updatedAt: NOW,
  pendingPermissionCount: 1,
  pendingQuestionCount: 1,
}

function eventEnvelope(sequence: number, event: object): object {
  return {
    type: "event",
    version: 1,
    brokerEpoch: BROKER_EPOCH,
    sequence,
    emittedAt: NOW + sequence,
    sessionId: SESSION_ID,
    event,
  }
}

describe("normalized event contracts", () => {
  test("round-trips the complete normalized event sequence", () => {
    const givenSequence = [
      eventEnvelope(1, { type: "session.updated", session: sessionSummary }),
      eventEnvelope(2, {
        type: "timeline.upserted",
        item: {
          type: "user_message",
          messageId: "msg_user",
          text: "Continue.",
          createdAt: NOW,
        },
      }),
      eventEnvelope(3, { type: "timeline.removed", messageId: "msg_user" }),
      eventEnvelope(4, { type: "status.updated", status: { type: "idle" } }),
      eventEnvelope(5, {
        type: "todos.updated",
        todos: [{ content: "Define contracts", status: "completed", priority: "high" }],
      }),
      eventEnvelope(6, {
        type: "permission.requested",
        permission: { id: "perm_contracts", action: "bash", resources: ["bun test"] },
      }),
      eventEnvelope(7, {
        type: "permission.resolved",
        requestId: "perm_contracts",
        decision: "once",
      }),
      eventEnvelope(8, {
        type: "question.requested",
        question: {
          id: "question_contracts",
          questions: [
            {
              header: "Release",
              question: "Ship?",
              options: [{ label: "Ship", description: "Create commit" }],
            },
          ],
        },
      }),
      eventEnvelope(9, { type: "question.resolved", requestId: "question_contracts" }),
      eventEnvelope(10, { type: "session.revoked", reason: "disabled" }),
    ]

    const parsedSequence = NormalizedEventSequenceSchema.parse(givenSequence)
    const serializedSequence = JSON.stringify(parsedSequence)
    const roundTrippedSequence = NormalizedEventSequenceSchema.parse(JSON.parse(serializedSequence))
    const sessionIds = roundTrippedSequence.map(normalizedEventSessionId)

    expect(roundTrippedSequence).toEqual(parsedSequence)
    expect(sessionIds.join(",")).toBe(Array.from({ length: 10 }, () => SESSION_ID).join(","))
  })

  test("rejects a negative monotonic sequence", () => {
    const givenEvent = eventEnvelope(-1, { type: "status.updated", status: { type: "idle" } })

    const parsedEvent = NormalizedEventEnvelopeSchema.safeParse(givenEvent)

    expect(parsedEvent.success).toBe(false)
  })

  test("rejects an unknown normalized event discriminator", () => {
    const givenEvent = eventEnvelope(1, { type: "session.shell", command: "pwd" })

    const parsedEvent = NormalizedEventEnvelopeSchema.safeParse(givenEvent)

    expect(parsedEvent.success).toBe(false)
  })

  test("rejects an event larger than 1 MiB", () => {
    const givenEvent = eventEnvelope(1, {
      type: "timeline.upserted",
      item: {
        type: "assistant_text",
        messageId: "msg_assistant",
        partId: "part_text",
        text: "a".repeat(MAX_PUBLIC_PAYLOAD_BYTES),
        phase: "complete",
      },
    })

    const parsedEvent = NormalizedEventEnvelopeSchema.safeParse(givenEvent)

    expect(parsedEvent.success).toBe(false)
  })

  test("rejects an event sequence above its bounded replay page", () => {
    const givenSequence = Array.from({ length: MAX_EVENT_BATCH_SIZE + 1 }, (_, index) =>
      eventEnvelope(index, { type: "status.updated", status: { type: "idle" } }),
    )

    const parsedSequence = NormalizedEventSequenceSchema.safeParse(givenSequence)

    expect(parsedSequence.success).toBe(false)
  })

  test("rejects unknown event envelope fields", () => {
    const givenEvent = {
      ...eventEnvelope(1, { type: "status.updated", status: { type: "idle" } }),
      rawUpstreamEvent: { secret: true },
    }

    const parsedEvent = NormalizedEventEnvelopeSchema.safeParse(givenEvent)

    expect(parsedEvent.success).toBe(false)
  })
})
