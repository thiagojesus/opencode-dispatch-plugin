import { expect, test } from "bun:test"
import {
  BrokerEpochSchema,
  MonotonicSequenceSchema,
  PROTOCOL_VERSION,
  SessionIdSchema,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"

import { SessionSynchronizer, type SnapshotPosition } from "../src/features/sessions/synchronizer"

const FIRST_EPOCH = BrokerEpochSchema.parse("550e8400-e29b-41d4-a716-446655440122")
const NEXT_EPOCH = BrokerEpochSchema.parse("550e8400-e29b-41d4-a716-446655440123")
const SESSION_ID = SessionIdSchema.parse("ses-recovery")

type VersionedSnapshot = SnapshotPosition & { readonly revision: number }

type ScheduledRecovery = {
  cancelled: boolean
  readonly delayMs: number
  readonly run: () => void
  ran: boolean
}

function recoveryHarness() {
  const scheduled: ScheduledRecovery[] = []
  return {
    delays: () => scheduled.map((task) => task.delayMs),
    runNext: () => {
      const next = scheduled.find((task) => !task.cancelled && !task.ran)
      if (next === undefined) return
      next.ran = true
      next.run()
    },
    runtime: {
      random: () => 0,
      schedule(delayMs: number, run: () => void) {
        const task: ScheduledRecovery = { cancelled: false, delayMs, run, ran: false }
        scheduled.push(task)
        return {
          cancel: () => {
            task.cancelled = true
          },
        }
      },
    },
    scheduled,
  }
}

function snapshot(
  revision: number,
  sequence: number,
  brokerEpoch = FIRST_EPOCH,
): VersionedSnapshot {
  return { brokerEpoch, revision, sequence: MonotonicSequenceSchema.parse(sequence) }
}

function event(sequence: number, brokerEpoch = FIRST_EPOCH) {
  return {
    type: "event",
    version: PROTOCOL_VERSION,
    brokerEpoch,
    sequence: MonotonicSequenceSchema.parse(sequence),
    emittedAt: UnixEpochMsSchema.parse(1_754_352_000_000 + sequence),
    sessionId: SESSION_ID,
    event: { type: "status.updated", status: { type: "busy" } },
  } as const
}

test("refreshes to authoritative state after missing, reordered, and leader-epoch events", async () => {
  const snapshots = [snapshot(1, 4), snapshot(2, 6), snapshot(3, 1, NEXT_EPOCH)]
  let loadIndex = 0
  let onFrame: ((frame: unknown) => void) | undefined
  const synchronizer = new SessionSynchronizer({
    async load() {
      return snapshots[Math.min(loadIndex++, snapshots.length - 1)] as VersionedSnapshot
    },
    openStream(_position, nextFrame) {
      onFrame = nextFrame
      return { close: () => undefined }
    },
  })
  synchronizer.start()
  await Bun.sleep(0)

  onFrame?.(event(4))
  onFrame?.(event(3))
  await Bun.sleep(0)
  expect(loadIndex).toBe(1)

  onFrame?.(event(6))
  await Bun.sleep(0)
  expect(synchronizer.state).toMatchObject({ type: "ready", snapshot: { revision: 2 } })

  onFrame?.(event(2, NEXT_EPOCH))
  await Bun.sleep(0)
  expect(synchronizer.state).toMatchObject({
    type: "ready",
    snapshot: { brokerEpoch: NEXT_EPOCH, revision: 3 },
  })
  synchronizer.stop()
})

test("background resume and network handoff abort a stale snapshot generation", async () => {
  let firstSignal: AbortSignal | undefined
  let resolveFirst: ((value: VersionedSnapshot) => void) | undefined
  let loadCount = 0
  const synchronizer = new SessionSynchronizer({
    load(signal) {
      loadCount += 1
      if (loadCount === 1) {
        firstSignal = signal
        return new Promise<VersionedSnapshot>((resolve) => {
          resolveFirst = resolve
        })
      }
      return Promise.resolve(snapshot(2, 2))
    },
    openStream() {
      return { close: () => undefined }
    },
  })
  synchronizer.start()
  await Bun.sleep(0)

  await synchronizer.refresh()
  resolveFirst?.(snapshot(1, 1))
  await Bun.sleep(0)

  expect(firstSignal?.aborted).toBe(true)
  expect(synchronizer.state).toMatchObject({ type: "ready", snapshot: { revision: 2 } })
  synchronizer.stop()
})

test("attach before, during, and after generation always starts from its snapshot", async () => {
  for (const initial of [snapshot(1, 0), snapshot(2, 4), snapshot(3, 8)]) {
    const opened: SnapshotPosition[] = []
    const synchronizer = new SessionSynchronizer({
      async load() {
        return initial
      },
      openStream(position) {
        opened.push(position)
        return { close: () => undefined }
      },
    })

    synchronizer.start()
    await Bun.sleep(0)
    expect(opened).toEqual([initial])
    synchronizer.stop()
  }
})

test("coalesces close, visibility, page, and network recovery into one attempt", async () => {
  const recovery = recoveryHarness()
  let loadCount = 0
  let closeStream: (() => void) | undefined
  const synchronizer = new SessionSynchronizer({
    async load() {
      loadCount += 1
      return snapshot(loadCount, loadCount)
    },
    openStream(_position, _onFrame, onClose) {
      closeStream = onClose
      return { close: () => undefined }
    },
    recovery: recovery.runtime,
  })
  synchronizer.start()
  await Bun.sleep(0)

  closeStream?.()
  synchronizer.visibilityChanged(true)
  synchronizer.pageShown()
  synchronizer.networkChanged(true)

  expect(synchronizer.state.type).toBe("reconnecting")
  expect(recovery.delays()).toEqual([250])

  recovery.runNext()
  await Bun.sleep(0)

  expect(loadCount).toBe(2)
  expect(synchronizer.state.type).toBe("ready")
  closeStream?.()
  expect(recovery.delays()).toEqual([250, 250])
  synchronizer.stop()
})

test("bounds exponential recovery after repeated snapshot failures", async () => {
  const recovery = recoveryHarness()
  let loadCount = 0
  const synchronizer = new SessionSynchronizer({
    async load() {
      loadCount += 1
      throw new Error("upstream unavailable")
    },
    openStream() {
      return { close: () => undefined }
    },
    recovery: recovery.runtime,
  })
  synchronizer.start()
  await Bun.sleep(0)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    recovery.runNext()
    await Bun.sleep(0)
  }

  expect(loadCount).toBe(6)
  expect(recovery.delays()).toEqual([250, 500, 1_000, 2_000, 4_000])
  expect(synchronizer.state.type).toBe("error")
  synchronizer.stop()
})

test("cancels pending recovery while offline and after stop", async () => {
  const recovery = recoveryHarness()
  let loadCount = 0
  let closeStream: (() => void) | undefined
  const synchronizer = new SessionSynchronizer({
    async load() {
      loadCount += 1
      return snapshot(loadCount, loadCount)
    },
    openStream(_position, _onFrame, onClose) {
      closeStream = onClose
      return { close: () => undefined }
    },
    recovery: recovery.runtime,
  })
  synchronizer.start()
  await Bun.sleep(0)

  closeStream?.()
  synchronizer.networkChanged(false)
  expect(synchronizer.state.type).toBe("offline")
  expect(recovery.scheduled[0]?.cancelled).toBe(true)

  synchronizer.networkChanged(true)
  expect(recovery.delays()).toEqual([250, 250])
  synchronizer.stop()
  expect(recovery.scheduled[1]?.cancelled).toBe(true)
  recovery.runNext()
  await Bun.sleep(0)

  expect(loadCount).toBe(1)
})
