import type { ProcessInstanceNonce, SessionId } from "@opencode-dispatch/contracts"

import type { BrokerHttpRouter } from "../api/index.ts"
import type { OpenCodeAdapter } from "../opencode/index.ts"
import type { ClusterRegistrySnapshot, MembershipRegistry } from "./registry.ts"
import type { ClusterStateStore } from "./state-store.ts"

type LeaderLifecycleOptions = {
  readonly httpRouter: BrokerHttpRouter
  readonly onSnapshot: (snapshot: ClusterRegistrySnapshot) => void
  readonly openCode: OpenCodeAdapter
  readonly registry: MembershipRegistry
  readonly stateStore: ClusterStateStore
}

export class LeaderLifecycle {
  readonly #httpRouter: BrokerHttpRouter
  readonly #onSnapshot: (snapshot: ClusterRegistrySnapshot) => void
  readonly #openCode: OpenCodeAdapter
  readonly #registry: MembershipRegistry
  readonly #stateStore: ClusterStateStore

  constructor(options: LeaderLifecycleOptions) {
    this.#httpRouter = options.httpRouter
    this.#onSnapshot = options.onSnapshot
    this.#openCode = options.openCode
    this.#registry = options.registry
    this.#stateStore = options.stateStore
  }

  async persist(): Promise<void> {
    await this.#stateStore.save(this.#registry.stateForPersistence())
    this.#onSnapshot(this.#registry.snapshot())
  }

  async unregister(lifecycle: Parameters<MembershipRegistry["unregister"]>[0]): Promise<void> {
    const sessionIds = this.#ownedSessionIds(lifecycle.processNonce)
    this.#registry.unregister(lifecycle)
    this.#openCode.unregisterProcess(lifecycle.processNonce)
    this.#revokeSessions(sessionIds, "process_exit")
    await this.persist()
  }

  async remove(processNonce: ProcessInstanceNonce): Promise<void> {
    const sessionIds = this.#ownedSessionIds(processNonce)
    this.#registry.remove(processNonce)
    this.#openCode.unregisterProcess(processNonce)
    this.#revokeSessions(sessionIds, "process_exit")
    await this.persist()
  }

  async expire(): Promise<void> {
    const snapshot = this.#registry.snapshot()
    const expired = this.#registry.expire()
    for (const processNonce of expired) {
      this.#openCode.unregisterProcess(processNonce)
      const sessionIds = snapshot.exposures
        .filter((exposure) => exposure.processNonce === processNonce)
        .map((exposure) => exposure.sessionId)
      this.#revokeSessions(sessionIds, "registration_expired")
    }
    if (expired.length > 0) await this.persist()
  }

  #ownedSessionIds(processNonce: ProcessInstanceNonce) {
    return this.#registry
      .snapshot()
      .exposures.filter((exposure) => exposure.processNonce === processNonce)
      .map((exposure) => exposure.sessionId)
  }

  #revokeSessions(
    sessionIds: readonly SessionId[],
    reason: "process_exit" | "registration_expired",
  ): void {
    for (const sessionId of sessionIds) this.#httpRouter.revokeSession(sessionId, reason)
  }
}
