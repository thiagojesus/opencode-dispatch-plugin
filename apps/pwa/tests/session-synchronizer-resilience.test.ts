import { expect, test } from "bun:test"
import {
  BrokerEpochSchema,
  MonotonicSequenceSchema,
  PROTOCOL_VERSION,
} from "@opencode-dispatch/contracts"

import { SessionSynchronizer, type SnapshotPosition } from "../src/features/sessions/synchronizer"

const BROKER_EPOCH = BrokerEpochSchema.parse("550e8400-e29b-41d4-a716-446655440122")

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
  }
}

function snapshot(sequence: number): SnapshotPosition {
  return {
    brokerEpoch: BROKER_EPOCH,
    sequence: MonotonicSequenceSchema.parse(sequence),
  }
}

function readyFrame(sequence: number) {
  return {
    type: "ready",
    version: PROTOCOL_VERSION,
    brokerEpoch: BROKER_EPOCH,
    sequence: MonotonicSequenceSchema.parse(sequence),
  } as const
}

test("does not load or attach when startup begins offline", async () => {
  let loadCount = 0
  let streamCount = 0
  const synchronizer = new SessionSynchronizer({
    async load() {
      loadCount += 1
      return snapshot(loadCount)
    },
    openStream() {
      streamCount += 1
      return { close: () => undefined }
    },
  })

  synchronizer.networkChanged(false)
  synchronizer.start()
  await Bun.sleep(0)
  await synchronizer.refresh()

  expect(synchronizer.state.type).toBe("offline")
  expect(loadCount).toBe(0)
  expect(streamCount).toBe(0)
  synchronizer.stop()
})

test("bounds repeated snapshot-success and immediate stream-close cycles", async () => {
  const recovery = recoveryHarness()
  let loadCount = 0
  let closeStream: (() => void) | undefined
  const synchronizer = new SessionSynchronizer({
    async load() {
      loadCount += 1
      return snapshot(loadCount)
    },
    openStream(_position, _onFrame, onClose) {
      closeStream = onClose
      return { close: () => undefined }
    },
    recovery: recovery.runtime,
  })
  synchronizer.start()
  await Bun.sleep(0)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    closeStream?.()
    recovery.runNext()
    await Bun.sleep(0)
  }
  closeStream?.()

  expect(loadCount).toBe(6)
  expect(recovery.delays()).toEqual([250, 500, 1_000, 2_000, 4_000])
  expect(synchronizer.state.type).toBe("offline")
  synchronizer.stop()
})

test("suspends the active stream when the browser goes offline", async () => {
  let closeCount = 0
  let loadCount = 0
  const synchronizer = new SessionSynchronizer({
    async load() {
      loadCount += 1
      return snapshot(loadCount)
    },
    openStream() {
      return {
        close: () => {
          closeCount += 1
        },
      }
    },
  })
  synchronizer.start()
  await Bun.sleep(0)

  synchronizer.networkChanged(false)
  await Bun.sleep(0)

  expect(closeCount).toBe(1)
  expect(loadCount).toBe(1)
  expect(synchronizer.state.type).toBe("offline")
  synchronizer.stop()
})

test("resets the failure burst only after the replacement stream is ready", async () => {
  const recovery = recoveryHarness()
  let loadCount = 0
  let closeStream: (() => void) | undefined
  let streamFrame: ((frame: unknown) => void) | undefined
  const synchronizer = new SessionSynchronizer({
    async load() {
      loadCount += 1
      return snapshot(loadCount)
    },
    openStream(_position, onFrame, onClose) {
      streamFrame = onFrame
      closeStream = onClose
      return { close: () => undefined }
    },
    recovery: recovery.runtime,
  })
  synchronizer.start()
  await Bun.sleep(0)

  closeStream?.()
  recovery.runNext()
  await Bun.sleep(0)
  streamFrame?.(readyFrame(2))
  closeStream?.()

  expect(recovery.delays()).toEqual([250, 250])
  synchronizer.stop()
})
