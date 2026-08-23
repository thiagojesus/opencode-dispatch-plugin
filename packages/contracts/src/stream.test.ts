import { describe, expect, test } from "bun:test"

import {
  EventStreamClientFrameSchema,
  EventStreamServerFrameSchema,
  PROTOCOL_VERSION,
} from "./index.ts"

const BROKER_EPOCH = "550e8400-e29b-41d4-a716-446655440120"
const SESSION_ID = "ses-stream-contract"

describe("event stream contracts", () => {
  test("parses a session subscription at an authoritative snapshot position", () => {
    // Given
    const frame = {
      type: "subscribe",
      version: PROTOCOL_VERSION,
      brokerEpoch: BROKER_EPOCH,
      sequence: 12,
      scope: { type: "session", sessionId: SESSION_ID },
    }

    // When
    const parsed = EventStreamClientFrameSchema.parse(frame)

    // Then
    expect(parsed.type).toBe("subscribe")
    expect(Number(parsed.sequence)).toBe(12)
    expect(parsed.scope).toMatchObject({ type: "session", sessionId: SESSION_ID })
  })

  test("parses replay and resync server outcomes without unknown fields", () => {
    // Given
    const replay = {
      type: "replay",
      version: PROTOCOL_VERSION,
      brokerEpoch: BROKER_EPOCH,
      sequence: 4,
      events: [
        {
          type: "event",
          version: PROTOCOL_VERSION,
          brokerEpoch: BROKER_EPOCH,
          sequence: 4,
          emittedAt: 1_754_352_000_004,
          sessionId: SESSION_ID,
          event: { type: "status.updated", status: { type: "busy" } },
        },
      ],
    }
    const resync = {
      type: "resync",
      version: PROTOCOL_VERSION,
      brokerEpoch: BROKER_EPOCH,
      sequence: 9,
      reason: "replay_unavailable",
    }

    // When
    const parsedReplay = EventStreamServerFrameSchema.parse(replay)
    const parsedResync = EventStreamServerFrameSchema.parse(resync)

    // Then
    expect(parsedReplay).toMatchObject({ type: "replay", sequence: 4 })
    expect(parsedResync).toMatchObject({
      type: "resync",
      sequence: 9,
      reason: "replay_unavailable",
    })
  })

  test("rejects unsupported scopes and server frame discriminators", () => {
    // Given
    const unsupportedClient = {
      type: "subscribe",
      version: PROTOCOL_VERSION,
      brokerEpoch: BROKER_EPOCH,
      sequence: 0,
      scope: { type: "terminal" },
    }
    const unsupportedServer = { type: "retry_forever", version: PROTOCOL_VERSION }

    // When
    const client = EventStreamClientFrameSchema.safeParse(unsupportedClient)
    const server = EventStreamServerFrameSchema.safeParse(unsupportedServer)

    // Then
    expect(client.success).toBe(false)
    expect(server.success).toBe(false)
  })
})
