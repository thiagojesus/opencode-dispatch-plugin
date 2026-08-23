import { expect, test } from "bun:test"
import {
  BrokerEpochSchema,
  MonotonicSequenceSchema,
  PROTOCOL_VERSION,
  SessionIdSchema,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"

import {
  SessionSynchronizer,
  type SnapshotPosition,
  type StreamConnection,
} from "../src/features/sessions/synchronizer"

const EPOCH = BrokerEpochSchema.parse("550e8400-e29b-41d4-a716-446655440122")
const SESSION_ID = SessionIdSchema.parse("ses-synchronizer")

function position(sequence: number): SnapshotPosition {
  return { brokerEpoch: EPOCH, sequence: MonotonicSequenceSchema.parse(sequence) }
}

test("fetches an authoritative snapshot before opening the stream and refreshes on invalidation", async () => {
  let loadCount = 0
  let onFrame: ((frame: unknown) => void) | undefined
  const openedAt: number[] = []
  const states: string[] = []
  const synchronizer = new SessionSynchronizer({
    async load() {
      loadCount += 1
      return position(loadCount - 1)
    },
    openStream(snapshot, nextFrame) {
      openedAt.push(snapshot.sequence)
      onFrame = nextFrame
      return { close: () => undefined }
    },
  })
  synchronizer.subscribe((state) => states.push(state.type))

  synchronizer.start()
  await Bun.sleep(0)
  onFrame?.({
    type: "event",
    version: PROTOCOL_VERSION,
    brokerEpoch: EPOCH,
    sequence: 1,
    emittedAt: UnixEpochMsSchema.parse(1_754_352_000_000),
    sessionId: SESSION_ID,
    event: { type: "status.updated", status: { type: "busy" } },
  })
  await Bun.sleep(0)

  expect(loadCount).toBe(2)
  expect(openedAt.map(Number)).toEqual([0, 1])
  expect(states.at(-1)).toBe("ready")
  synchronizer.stop()
})

test("ignores duplicate events but resnapshots on replay gaps and epoch replacement", async () => {
  let loadCount = 0
  let onFrame: ((frame: unknown) => void) | undefined
  const connection: StreamConnection = { close: () => undefined }
  const synchronizer = new SessionSynchronizer({
    async load() {
      loadCount += 1
      return position(4)
    },
    openStream(_snapshot, nextFrame) {
      onFrame = nextFrame
      return connection
    },
  })

  synchronizer.start()
  await Bun.sleep(0)
  onFrame?.({
    type: "event",
    version: PROTOCOL_VERSION,
    brokerEpoch: EPOCH,
    sequence: 4,
    emittedAt: UnixEpochMsSchema.parse(1_754_352_000_000),
    sessionId: SESSION_ID,
    event: { type: "status.updated", status: { type: "idle" } },
  })
  await Bun.sleep(0)
  expect(loadCount).toBe(1)

  onFrame?.({
    type: "resync",
    version: PROTOCOL_VERSION,
    brokerEpoch: EPOCH,
    sequence: 8,
    reason: "sequence_gap",
  })
  await Bun.sleep(0)
  expect(loadCount).toBe(2)
  synchronizer.stop()
})

test("removes transcript state when revocation arrives before stream close", async () => {
  let onFrame: ((frame: unknown) => void) | undefined
  const synchronizer = new SessionSynchronizer({
    async load() {
      return position(0)
    },
    openStream(_snapshot, nextFrame) {
      onFrame = nextFrame
      return { close: () => undefined }
    },
  })
  synchronizer.start()
  await Bun.sleep(0)

  onFrame?.({
    type: "event",
    version: PROTOCOL_VERSION,
    brokerEpoch: EPOCH,
    sequence: 1,
    emittedAt: UnixEpochMsSchema.parse(1_754_352_000_001),
    sessionId: SESSION_ID,
    event: { type: "session.revoked", reason: "disabled" },
  })

  expect(synchronizer.state).toEqual({ type: "revoked" })
  synchronizer.stop()
})

test("ignores a delayed close callback from an obsolete stream generation", async () => {
  const closes: Array<() => void> = []
  const synchronizer = new SessionSynchronizer({
    async load() {
      return position(closes.length)
    },
    openStream(_snapshot, _onFrame, onClose) {
      closes.push(onClose)
      return { close: () => undefined }
    },
  })
  synchronizer.start()
  await Bun.sleep(0)
  await synchronizer.refresh()

  closes[0]?.()

  expect(synchronizer.state.type).toBe("ready")
  synchronizer.stop()
})
