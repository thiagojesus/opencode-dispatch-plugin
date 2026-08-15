import type {
  BrokerEpoch,
  LoopbackServerUrl,
  ProcessExposure,
  ProcessId,
  ProcessInstanceNonce,
  ProcessLifecycleMessage,
  UnixEpochMs,
} from "@opencode-dispatch/contracts"

import { ClusterError } from "./errors.ts"

type RegistrationMessage = Extract<ProcessLifecycleMessage, { readonly type: "process.register" }>
type HeartbeatMessage = Extract<ProcessLifecycleMessage, { readonly type: "process.heartbeat" }>
type UnregisterMessage = Extract<ProcessLifecycleMessage, { readonly type: "process.unregister" }>

export type ClusterMemberRecord = {
  readonly processNonce: ProcessInstanceNonce
  readonly serverUrl: LoopbackServerUrl
  readonly pid: ProcessId
  readonly startedAt: UnixEpochMs
  readonly lastSeenAt: number
  readonly expiresAt: number
}

export type PersistedRegistration = ClusterMemberRecord & {
  readonly exposures: readonly ProcessExposure[]
}

export type PersistedClusterState = {
  readonly version: 1
  readonly registrations: readonly PersistedRegistration[]
}

export type ClusterRegistrySnapshot = {
  readonly brokerEpoch: BrokerEpoch
  readonly members: readonly ClusterMemberRecord[]
  readonly exposures: readonly ProcessExposure[]
}

type MembershipRegistryOptions = {
  readonly brokerEpoch: BrokerEpoch
  readonly now: () => number
  readonly restoredState: PersistedClusterState
  readonly ttlMs: number
}

function compareNonce(
  left: { readonly processNonce: ProcessInstanceNonce },
  right: { readonly processNonce: ProcessInstanceNonce },
): number {
  return left.processNonce.localeCompare(right.processNonce)
}

function compareExposure(left: ProcessExposure, right: ProcessExposure): number {
  return left.sessionId.localeCompare(right.sessionId)
}

function sameProcess(left: ClusterMemberRecord, right: RegistrationMessage): boolean {
  return (
    left.pid === right.pid &&
    left.serverUrl === right.serverUrl &&
    left.startedAt === right.startedAt
  )
}

export class MembershipRegistry {
  readonly #brokerEpoch: BrokerEpoch
  readonly #exposures = new Map<string, ProcessExposure>()
  readonly #members = new Map<ProcessInstanceNonce, ClusterMemberRecord>()
  readonly #now: () => number
  readonly #restored = new Map<ProcessInstanceNonce, PersistedRegistration>()
  readonly #ttlMs: number

  constructor(options: MembershipRegistryOptions) {
    if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0) {
      throw new ClusterError("configuration_invalid")
    }
    this.#brokerEpoch = options.brokerEpoch
    this.#now = options.now
    this.#ttlMs = options.ttlMs
    const now = this.#currentTime()
    for (const registration of options.restoredState.registrations) {
      if (registration.expiresAt >= now) {
        this.#restored.set(registration.processNonce, registration)
      }
    }
  }

  register(message: RegistrationMessage, exposures: readonly ProcessExposure[]): void {
    const existing = this.#members.get(message.processNonce)
    const restored = this.#restored.get(message.processNonce)
    if (
      (existing !== undefined && !sameProcess(existing, message)) ||
      (restored !== undefined && !sameProcess(restored, message))
    ) {
      throw new ClusterError("process_nonce_conflict")
    }
    const accepted = new Map<string, ProcessExposure>()
    for (const exposure of [...(restored?.exposures ?? []), ...exposures]) {
      if (exposure.processNonce !== message.processNonce) {
        throw new ClusterError("exposure_owner_mismatch")
      }
      this.#assertExposureAvailable(exposure)
      accepted.set(exposure.sessionId, exposure)
    }
    const now = this.#currentTime()
    this.#members.set(message.processNonce, {
      processNonce: message.processNonce,
      serverUrl: message.serverUrl,
      pid: message.pid,
      startedAt: message.startedAt,
      lastSeenAt: now,
      expiresAt: now + this.#ttlMs,
    })
    this.#restored.delete(message.processNonce)
    for (const exposure of accepted.values()) {
      this.#exposures.set(exposure.sessionId, exposure)
    }
  }

  heartbeat(message: HeartbeatMessage): void {
    const member = this.#members.get(message.processNonce)
    if (member === undefined) {
      throw new ClusterError("member_not_registered")
    }
    const now = this.#currentTime()
    this.#members.set(message.processNonce, {
      ...member,
      lastSeenAt: now,
      expiresAt: now + this.#ttlMs,
    })
  }

  unregister(message: UnregisterMessage): void {
    this.remove(message.processNonce)
  }

  enable(exposure: ProcessExposure): void {
    if (!this.#members.has(exposure.processNonce)) {
      throw new ClusterError("member_not_registered")
    }
    this.#assertExposureAvailable(exposure)
    this.#exposures.set(exposure.sessionId, exposure)
  }

  disable(processNonce: ProcessInstanceNonce, sessionId: string): void {
    const exposure = this.#exposures.get(sessionId)
    if (exposure === undefined) {
      return
    }
    if (exposure.processNonce !== processNonce) {
      throw new ClusterError("exposure_owner_mismatch")
    }
    this.#exposures.delete(sessionId)
  }

  remove(processNonce: ProcessInstanceNonce): void {
    this.#members.delete(processNonce)
    this.#restored.delete(processNonce)
    for (const [sessionId, exposure] of this.#exposures) {
      if (exposure.processNonce === processNonce) {
        this.#exposures.delete(sessionId)
      }
    }
  }

  expire(): readonly ProcessInstanceNonce[] {
    const now = this.#currentTime()
    const expired: ProcessInstanceNonce[] = []
    for (const member of this.#members.values()) {
      if (member.expiresAt < now) {
        expired.push(member.processNonce)
        this.remove(member.processNonce)
      }
    }
    for (const restored of this.#restored.values()) {
      if (restored.expiresAt < now) {
        this.#restored.delete(restored.processNonce)
      }
    }
    return expired.sort()
  }

  snapshot(): ClusterRegistrySnapshot {
    return {
      brokerEpoch: this.#brokerEpoch,
      members: [...this.#members.values()].sort(compareNonce),
      exposures: [...this.#exposures.values()].sort(compareExposure),
    }
  }

  stateForPersistence(): PersistedClusterState {
    const registrations = [...this.#restored.values()]
    for (const member of this.#members.values()) {
      registrations.push({
        ...member,
        exposures: [...this.#exposures.values()]
          .filter((exposure) => exposure.processNonce === member.processNonce)
          .sort(compareExposure),
      })
    }
    return { version: 1, registrations: registrations.sort(compareNonce) }
  }

  #assertExposureAvailable(candidate: ProcessExposure): void {
    const current = this.#exposures.get(candidate.sessionId)
    if (current !== undefined && current.processNonce !== candidate.processNonce) {
      throw new ClusterError("exposure_conflict")
    }
    for (const registration of this.#restored.values()) {
      const conflict = registration.exposures.some(
        (exposure) =>
          exposure.sessionId === candidate.sessionId &&
          exposure.processNonce !== candidate.processNonce,
      )
      if (conflict) {
        throw new ClusterError("exposure_conflict")
      }
    }
  }

  #currentTime(): number {
    const now = this.#now()
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new ClusterError("configuration_invalid")
    }
    return now
  }
}

export { ClusterError } from "./errors.ts"
