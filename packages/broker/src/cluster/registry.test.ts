import { describe, expect, test } from "bun:test"

import {
  BrokerEpochSchema,
  ProcessExposureSchema,
  type ProcessInstanceNonce,
  ProcessInstanceNonceSchema,
  ProcessLifecycleMessageSchema,
  type SessionId,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"

const implementation = Bun.file(new URL("./registry.ts", import.meta.url))
const EPOCH = BrokerEpochSchema.parse("00000000-0000-4000-8000-000000000001")
const STARTED_AT = 1_754_352_000_000

function processNonce(index: number): ProcessInstanceNonce {
  return ProcessInstanceNonceSchema.parse(
    `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
  )
}

function sessionId(index: number): SessionId {
  return SessionIdSchema.parse(`ses-cluster-${index}`)
}

function registration(index: number) {
  const parsed = ProcessLifecycleMessageSchema.parse({
    type: "process.register",
    version: 1,
    processNonce: processNonce(index),
    serverUrl: `http://127.0.0.1:${40_000 + index}`,
    pid: 2_000 + index,
    startedAt: STARTED_AT + index,
  })
  if (parsed.type !== "process.register") {
    throw new TypeError("Expected a process registration fixture.")
  }
  return parsed
}

function exposure(index: number) {
  return ProcessExposureSchema.parse({
    version: 1,
    sessionId: sessionId(index),
    processNonce: processNonce(index),
    title: `Cluster session ${index}`,
    enabledAt: STARTED_AT + index,
  })
}

async function registryModule() {
  expect(await implementation.exists()).toBe(true)
  return import("./registry.ts")
}

describe("cluster membership registry", () => {
  test.each([1, 3, 10])(
    "tracks %i authenticated members without duplicate ownership",
    async (size) => {
      const { MembershipRegistry } = await registryModule()
      let now = STARTED_AT
      const registry = new MembershipRegistry({
        brokerEpoch: EPOCH,
        now: () => now,
        restoredState: { version: 1, registrations: [] },
        ttlMs: 15_000,
      })

      for (let index = 1; index <= size; index += 1) {
        now += 1
        registry.register(registration(index), [])
      }

      expect(registry.snapshot().members).toHaveLength(size)
      expect(new Set(registry.snapshot().members.map((member) => member.processNonce)).size).toBe(
        size,
      )
    },
  )

  test("removes process-bound exposure on explicit unregister", async () => {
    const { MembershipRegistry } = await registryModule()
    const registry = new MembershipRegistry({
      brokerEpoch: EPOCH,
      now: () => STARTED_AT,
      restoredState: { version: 1, registrations: [] },
      ttlMs: 15_000,
    })
    registry.register(registration(1), [])
    registry.enable(exposure(1))
    const unregister = ProcessLifecycleMessageSchema.parse({
      type: "process.unregister",
      version: 1,
      processNonce: processNonce(1),
      sentAt: STARTED_AT + 1,
      reason: "dispose",
    })
    if (unregister.type !== "process.unregister") {
      throw new TypeError("Expected an unregister fixture.")
    }

    registry.unregister(unregister)

    expect(registry.snapshot().members).toEqual([])
    expect(registry.snapshot().exposures).toEqual([])
  })

  test("expires a missed heartbeat and its exposure at the registration TTL", async () => {
    const { MembershipRegistry } = await registryModule()
    let now = STARTED_AT
    const registry = new MembershipRegistry({
      brokerEpoch: EPOCH,
      now: () => now,
      restoredState: { version: 1, registrations: [] },
      ttlMs: 15_000,
    })
    registry.register(registration(1), [exposure(1)])
    now += 15_001

    const expired = registry.expire()

    expect(expired).toEqual([processNonce(1)])
    expect(registry.snapshot().exposures).toEqual([])
  })

  test("restores exposure only after the same live process nonce re-registers", async () => {
    const { MembershipRegistry } = await registryModule()
    const original = new MembershipRegistry({
      brokerEpoch: EPOCH,
      now: () => STARTED_AT,
      restoredState: { version: 1, registrations: [] },
      ttlMs: 15_000,
    })
    original.register(registration(1), [exposure(1)])
    const restored = new MembershipRegistry({
      brokerEpoch: EPOCH,
      now: () => STARTED_AT + 1,
      restoredState: original.stateForPersistence(),
      ttlMs: 15_000,
    })
    expect(restored.snapshot().exposures).toEqual([])

    restored.register(registration(1), [])

    expect(restored.snapshot().exposures).toEqual([exposure(1)])
  })

  test("does not inherit exposure when a reused PID has a new process nonce", async () => {
    const { MembershipRegistry } = await registryModule()
    const original = new MembershipRegistry({
      brokerEpoch: EPOCH,
      now: () => STARTED_AT,
      restoredState: { version: 1, registrations: [] },
      ttlMs: 15_000,
    })
    original.register(registration(1), [exposure(1)])
    const restored = new MembershipRegistry({
      brokerEpoch: EPOCH,
      now: () => STARTED_AT + 1,
      restoredState: original.stateForPersistence(),
      ttlMs: 15_000,
    })
    const reusedPidRegistration = { ...registration(2), pid: registration(1).pid }

    restored.register(reusedPidRegistration, [])

    expect(restored.snapshot().exposures).toEqual([])
  })

  test("rejects split ownership of one session by two process nonces", async () => {
    const { ClusterError, MembershipRegistry } = await registryModule()
    const registry = new MembershipRegistry({
      brokerEpoch: EPOCH,
      now: () => STARTED_AT,
      restoredState: { version: 1, registrations: [] },
      ttlMs: 15_000,
    })
    registry.register(registration(1), [exposure(1)])
    registry.register(registration(2), [])
    const conflictingExposure = ProcessExposureSchema.parse({
      ...exposure(1),
      processNonce: processNonce(2),
    })

    const enableConflict = () => registry.enable(conflictingExposure)

    expect(enableConflict).toThrow(ClusterError)
    expect(enableConflict).toThrow(expect.objectContaining({ code: "exposure_conflict" }))
  })

  test("drops stale persisted registrations before they can be restored", async () => {
    const { MembershipRegistry } = await registryModule()
    const original = new MembershipRegistry({
      brokerEpoch: EPOCH,
      now: () => STARTED_AT,
      restoredState: { version: 1, registrations: [] },
      ttlMs: 15_000,
    })
    original.register(registration(1), [exposure(1)])

    const restored = new MembershipRegistry({
      brokerEpoch: EPOCH,
      now: () => STARTED_AT + 15_001,
      restoredState: original.stateForPersistence(),
      ttlMs: 15_000,
    })
    restored.register(registration(1), [])

    expect(restored.snapshot().exposures).toEqual([])
  })
})
