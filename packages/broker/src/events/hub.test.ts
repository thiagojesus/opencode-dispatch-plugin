import { describe, expect, test } from "bun:test"

import {
  BrokerEpochSchema,
  type EventStreamServerFrame,
  MonotonicSequenceSchema,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"

import { SessionEventHub } from "./hub.ts"

const BROKER_EPOCH = BrokerEpochSchema.parse("550e8400-e29b-41d4-a716-446655440121")
const FIRST_SESSION = SessionIdSchema.parse("ses-stream-first")
const SECOND_SESSION = SessionIdSchema.parse("ses-stream-second")

function statusEvent(type: "busy" | "idle") {
  return { type: "status.updated", status: { type } } as const
}

describe("SessionEventHub", () => {
  test("replays events after the supplied session snapshot position", () => {
    // Given
    const hub = new SessionEventHub({
      brokerEpoch: BROKER_EPOCH,
      now: () => 1_754_352_000_000,
      replayLimit: 4,
    })
    hub.publish({ type: "session", sessionId: FIRST_SESSION }, FIRST_SESSION, statusEvent("busy"))
    const frames: EventStreamServerFrame[] = []

    // When
    hub.subscribe(
      {
        type: "subscribe",
        version: 1,
        brokerEpoch: BROKER_EPOCH,
        sequence: MonotonicSequenceSchema.parse(0),
        scope: { type: "session", sessionId: FIRST_SESSION },
      },
      { close: () => undefined, send: (frame) => frames.push(frame) },
    )

    // Then
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({ type: "replay", sequence: 1 })
  })

  test("keeps independent session channels from creating false sequence gaps", () => {
    // Given
    const hub = new SessionEventHub({
      brokerEpoch: BROKER_EPOCH,
      now: () => 1_754_352_000_000,
      replayLimit: 4,
    })

    // When
    const first = hub.publish(
      { type: "session", sessionId: FIRST_SESSION },
      FIRST_SESSION,
      statusEvent("busy"),
    )
    const second = hub.publish(
      { type: "session", sessionId: SECOND_SESSION },
      SECOND_SESSION,
      statusEvent("idle"),
    )

    // Then
    expect(Number(first.sequence)).toBe(1)
    expect(Number(second.sequence)).toBe(1)
    expect(Number(hub.position({ type: "session", sessionId: FIRST_SESSION }).sequence)).toBe(1)
  })

  test("never delivers one enabled session event to another session subscriber", () => {
    const hub = new SessionEventHub({
      brokerEpoch: BROKER_EPOCH,
      now: () => 1_754_352_000_000,
      replayLimit: 4,
    })
    const firstFrames: EventStreamServerFrame[] = []
    const secondFrames: EventStreamServerFrame[] = []
    const subscribe = (sessionId: typeof FIRST_SESSION, frames: EventStreamServerFrame[]) =>
      hub.subscribe(
        {
          type: "subscribe",
          version: 1,
          brokerEpoch: BROKER_EPOCH,
          sequence: MonotonicSequenceSchema.parse(0),
          scope: { type: "session", sessionId },
        },
        { close: () => undefined, send: (frame) => frames.push(frame) },
      )
    subscribe(FIRST_SESSION, firstFrames)
    subscribe(SECOND_SESSION, secondFrames)

    hub.publish({ type: "session", sessionId: FIRST_SESSION }, FIRST_SESSION, statusEvent("busy"))

    expect(firstFrames.at(-1)).toMatchObject({ type: "event", sessionId: FIRST_SESSION })
    expect(secondFrames).toHaveLength(1)
    expect(secondFrames[0]).toMatchObject({ type: "ready", sequence: 0 })
  })

  test("requires resynchronization when the bounded replay window overflows", () => {
    // Given
    const hub = new SessionEventHub({
      brokerEpoch: BROKER_EPOCH,
      now: () => 1_754_352_000_000,
      replayLimit: 2,
    })
    for (const type of ["busy", "idle", "busy"] as const) {
      hub.publish({ type: "session", sessionId: FIRST_SESSION }, FIRST_SESSION, statusEvent(type))
    }
    const frames: EventStreamServerFrame[] = []

    // When
    hub.subscribe(
      {
        type: "subscribe",
        version: 1,
        brokerEpoch: BROKER_EPOCH,
        sequence: MonotonicSequenceSchema.parse(0),
        scope: { type: "session", sessionId: FIRST_SESSION },
      },
      { close: () => undefined, send: (frame) => frames.push(frame) },
    )

    // Then
    expect(frames).toEqual([
      {
        type: "resync",
        version: 1,
        brokerEpoch: BROKER_EPOCH,
        sequence: MonotonicSequenceSchema.parse(3),
        reason: "replay_unavailable",
      },
    ])
  })

  test("emits revocation before closing only the affected session", () => {
    // Given
    const hub = new SessionEventHub({
      brokerEpoch: BROKER_EPOCH,
      now: () => 1_754_352_000_000,
      replayLimit: 4,
    })
    const frames: EventStreamServerFrame[] = []
    const closeCodes: number[] = []
    hub.subscribe(
      {
        type: "subscribe",
        version: 1,
        brokerEpoch: BROKER_EPOCH,
        sequence: MonotonicSequenceSchema.parse(0),
        scope: { type: "session", sessionId: FIRST_SESSION },
      },
      { close: (code) => closeCodes.push(code), send: (frame) => frames.push(frame) },
    )

    // When
    hub.revoke(FIRST_SESSION, "disabled")

    // Then
    expect(frames.at(-1)).toMatchObject({
      type: "event",
      sequence: 1,
      event: { type: "session.revoked", reason: "disabled" },
    })
    expect(closeCodes).toEqual([4003])
    expect(Number(hub.position({ type: "session", sessionId: FIRST_SESSION }).sequence)).toBe(0)
  })

  test("revokes and retires a session when its channel occupies the final capacity slot", () => {
    const hub = new SessionEventHub({
      brokerEpoch: BROKER_EPOCH,
      channelLimit: 1,
      now: () => 1_754_352_000_000,
      replayLimit: 4,
    })
    const frames: EventStreamServerFrame[] = []
    const closeCodes: number[] = []
    hub.subscribe(
      {
        type: "subscribe",
        version: 1,
        brokerEpoch: BROKER_EPOCH,
        sequence: MonotonicSequenceSchema.parse(0),
        scope: { type: "session", sessionId: FIRST_SESSION },
      },
      { close: (code) => closeCodes.push(code), send: (frame) => frames.push(frame) },
    )

    hub.revoke(FIRST_SESSION, "disabled")

    expect(frames.at(-1)).toMatchObject({ event: { type: "session.revoked" } })
    expect(closeCodes).toEqual([4003])
  })

  test("caps subscribers for each event channel", () => {
    const hub = new SessionEventHub({
      brokerEpoch: BROKER_EPOCH,
      now: () => 1_754_352_000_000,
      replayLimit: 4,
      subscriberLimit: 1,
    })
    const subscription = {
      type: "subscribe",
      version: 1,
      brokerEpoch: BROKER_EPOCH,
      sequence: MonotonicSequenceSchema.parse(0),
      scope: { type: "sessions" },
    } as const
    const closeCodes: number[] = []
    hub.subscribe(subscription, { close: () => undefined, send: () => undefined })

    hub.subscribe(subscription, {
      close: (code) => closeCodes.push(code),
      send: () => undefined,
    })

    expect(closeCodes).toEqual([1013])
  })

  test("bounds the total number of retained event channels", () => {
    const hub = new SessionEventHub({
      brokerEpoch: BROKER_EPOCH,
      channelLimit: 1,
      now: () => 1_754_352_000_000,
      replayLimit: 4,
    })
    hub.position({ type: "session", sessionId: FIRST_SESSION })

    expect(() => hub.position({ type: "session", sessionId: SECOND_SESSION })).toThrow(
      "Event channel limit reached",
    )
  })
})
