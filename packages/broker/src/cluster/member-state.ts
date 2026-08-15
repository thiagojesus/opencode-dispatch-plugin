import type {
  BrokerEpoch,
  ProcessExposure,
  ProcessInstanceNonce,
  SessionId,
} from "@opencode-dispatch/contracts"
import type { OpenCodeSessionSignal } from "../opencode/index.ts"
import type { ClusterErrorCode } from "./errors.ts"
import type { ClusterRegistrySnapshot } from "./registry.ts"

export type ClusterMemberStatus = {
  readonly brokerEpoch: BrokerEpoch | undefined
  readonly connected: boolean
  readonly errorCode: ClusterErrorCode | undefined
  readonly leaderSnapshot: ClusterRegistrySnapshot | undefined
  readonly processNonce: ProcessInstanceNonce
  readonly role: "leader" | "follower" | "disconnected"
}

type StatusListener = (status: ClusterMemberStatus) => void

export class MemberState {
  readonly #exposures = new Map<SessionId, ProcessExposure>()
  readonly #listeners = new Set<StatusListener>()
  readonly #signals = new Map<SessionId, OpenCodeSessionSignal>()
  readonly #processNonce: ProcessInstanceNonce
  #brokerEpoch: BrokerEpoch | undefined
  #connected = false
  #errorCode: ClusterErrorCode | undefined
  #leaderSnapshot: ClusterRegistrySnapshot | undefined
  #role: ClusterMemberStatus["role"] = "disconnected"

  constructor(processNonce: ProcessInstanceNonce) {
    this.#processNonce = processNonce
  }

  status(): ClusterMemberStatus {
    return {
      brokerEpoch: this.#brokerEpoch,
      connected: this.#connected,
      errorCode: this.#errorCode,
      leaderSnapshot: this.#leaderSnapshot,
      processNonce: this.#processNonce,
      role: this.#role,
    }
  }

  subscribe(listener: StatusListener): () => void {
    this.#listeners.add(listener)
    listener(this.status())
    return () => this.#listeners.delete(listener)
  }

  exposures(): readonly ProcessExposure[] {
    return [...this.#exposures.values()]
  }

  signals(): readonly OpenCodeSessionSignal[] {
    return [...this.#signals.values()]
  }

  setSignal(signal: OpenCodeSessionSignal): void {
    this.#signals.set(signal.sessionId, signal)
  }

  addExposure(exposure: ProcessExposure): void {
    this.#exposures.set(exposure.sessionId, exposure)
  }

  removeExposure(sessionId: SessionId): void {
    this.#exposures.delete(sessionId)
  }

  connected(role: "leader" | "follower", brokerEpoch: BrokerEpoch): void {
    this.#brokerEpoch = brokerEpoch
    this.#connected = true
    this.#errorCode = undefined
    this.#role = role
    this.#emit()
  }

  disconnected(errorCode?: ClusterErrorCode): void {
    this.#connected = false
    this.#errorCode = errorCode
    this.#role = "disconnected"
    this.#emit()
  }

  setLeaderSnapshot(snapshot: ClusterRegistrySnapshot | undefined): void {
    this.#leaderSnapshot = snapshot
    this.#emit()
  }

  setError(errorCode: ClusterErrorCode): void {
    this.#errorCode = errorCode
    this.#emit()
  }

  #emit(): void {
    const status = this.status()
    for (const listener of this.#listeners) {
      listener(status)
    }
  }
}
