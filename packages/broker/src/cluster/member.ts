import {
  type DispatchConfig,
  type LoopbackServerUrlSchema,
  type ProcessIdSchema,
  type ProcessInstanceNonce,
  ProcessLifecycleMessageSchema,
  type UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"

import type { BasicAuthorization, OpenCodeAdapter } from "../opencode/index.ts"
import type { HostSecret } from "../security/index.ts"
import { ClusterConnection } from "./connection.ts"
import { electOrDiscover } from "./election.ts"
import { ClusterError, toClusterError } from "./errors.ts"
import type { LeaderServer } from "./leader.ts"
import { createUnregisterMessage } from "./member-lifecycle.ts"
import { MemberOperations } from "./member-operations.ts"
import { type ClusterMemberStatus, MemberState } from "./member-state.ts"
import type { ClusterStateStore } from "./state-store.ts"

export class ClusterMember {
  readonly brokerUrl: string
  readonly #config: DispatchConfig
  readonly #authorization: BasicAuthorization | undefined
  readonly #hostSecret: HostSecret
  readonly #operations: MemberOperations
  readonly #pid: ReturnType<typeof ProcessIdSchema.parse>
  readonly #processNonce: ProcessInstanceNonce
  readonly #serverUrl: ReturnType<typeof LoopbackServerUrlSchema.parse>
  readonly #startedAt: ReturnType<typeof UnixEpochMsSchema.parse>
  readonly #state: MemberState
  readonly #stateStore: ClusterStateStore
  #connection: ClusterConnection | undefined
  #disposed = false
  #heartbeatTimer: ReturnType<typeof setInterval> | undefined
  #leader: LeaderServer | undefined
  #reconnectTask: Promise<void> | undefined

  constructor(input: {
    readonly authorization?: BasicAuthorization
    readonly config: DispatchConfig
    readonly hostSecret: HostSecret
    readonly pid: ReturnType<typeof ProcessIdSchema.parse>
    readonly processNonce: ProcessInstanceNonce
    readonly serverUrl: ReturnType<typeof LoopbackServerUrlSchema.parse>
    readonly startedAt: ReturnType<typeof UnixEpochMsSchema.parse>
    readonly stateStore: ClusterStateStore
  }) {
    this.#authorization = input.authorization
    this.#config = input.config
    this.#hostSecret = input.hostSecret
    this.#pid = input.pid
    this.#processNonce = input.processNonce
    this.#serverUrl = input.serverUrl
    this.#startedAt = input.startedAt
    this.#state = new MemberState(input.processNonce)
    this.#stateStore = input.stateStore
    this.#operations = new MemberOperations({
      connection: () => this.#requireConnection(),
      leader: () => this.#leader,
      processNonce: input.processNonce,
      state: this.#state,
    })
    this.brokerUrl = `http://${input.config.broker.host}:${input.config.broker.port}`
  }

  async start(): Promise<void> {
    await this.#establish()
  }

  readonly status = (): ClusterMemberStatus => this.#state.status()

  subscribe(listener: (status: ClusterMemberStatus) => void): () => void {
    return this.#state.subscribe(listener)
  }

  async enableExposure(input: {
    readonly enabledAt: unknown
    readonly sessionId: unknown
    readonly title: unknown
  }): Promise<void> {
    await this.#operations.enableExposure(input)
  }

  async disableExposure(sessionId: unknown): Promise<void> {
    await this.#operations.disableExposure(sessionId)
  }

  async publishOpenCodeSignal(signal: unknown): Promise<void> {
    await this.#operations.publishOpenCodeSignal(signal)
  }

  authoritativeOpenCode(): OpenCodeAdapter | undefined {
    return this.#operations.authoritativeOpenCode()
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    await this.#shutdownResources()
    await this.#reconnectTask
    await this.#shutdownResources()
    this.#state.disconnected()
  }

  async #shutdownResources(): Promise<void> {
    this.#stopHeartbeat()
    const connection = this.#connection
    this.#connection = undefined
    if (connection !== undefined) {
      try {
        await connection.unregister(createUnregisterMessage(this.#processNonce))
      } catch (error) {
        if (!(error instanceof ClusterError)) {
          throw error
        }
      }
      connection.close()
    }
    const leader = this.#leader
    this.#leader = undefined
    await leader?.stop()
  }

  async #establish(): Promise<void> {
    let failure = new ClusterError("reconnect_exhausted")
    for (let attempt = 0; attempt < this.#config.reconnect.maxAttempts; attempt += 1) {
      if (this.#disposed) {
        return
      }
      try {
        await this.#connectOnce()
        return
      } catch (error) {
        failure = error instanceof ClusterError ? error : toClusterError(error)
        await this.#leader?.stop()
        this.#leader = undefined
        if (this.#disposed) {
          return
        }
        if (
          failure.code === "foreign_listener" ||
          failure.code === "protocol_incompatible" ||
          failure.code === "configuration_invalid"
        ) {
          throw failure
        }
        if (attempt + 1 < this.#config.reconnect.maxAttempts) {
          await this.#delayForAttempt(attempt)
        }
      }
    }
    throw failure.code === "reconnect_exhausted" ? failure : new ClusterError("reconnect_exhausted")
  }

  async #connectOnce(): Promise<void> {
    const health = await this.#leadOrDiscover()
    const registration = ProcessLifecycleMessageSchema.parse({
      type: "process.register",
      version: 1,
      processNonce: this.#processNonce,
      serverUrl: this.#serverUrl,
      pid: this.#pid,
      startedAt: this.#startedAt,
    })
    if (registration.type !== "process.register") {
      throw new ClusterError("internal_failure")
    }
    const connection = await ClusterConnection.connect({
      brokerEpoch: health.brokerEpoch,
      exposures: this.#state.exposures(),
      hostSecret: this.#hostSecret,
      onClose: () => this.#scheduleReconnect(),
      registration,
      signals: this.#state.signals(),
      timeoutMs: Math.min(this.#config.registration.ttlMs, 5_000),
      ...(this.#authorization === undefined ? {} : { authorization: this.#authorization }),
    })
    this.#connection = connection
    this.#state.connected(this.#leader === undefined ? "follower" : "leader", health.brokerEpoch)
    this.#startHeartbeat()
  }

  async #leadOrDiscover() {
    const result = await electOrDiscover({
      brokerUrl: this.brokerUrl,
      config: this.#config,
      hostSecret: this.#hostSecret,
      onFailure: (error) => this.#leaderFailed(this.#leader, error),
      onSnapshot: (snapshot) => {
        this.#state.setLeaderSnapshot(snapshot)
      },
      stateStore: this.#stateStore,
    })
    this.#leader = result.leader
    this.#state.setLeaderSnapshot(result.leaderSnapshot)
    return result.health
  }

  #startHeartbeat(): void {
    this.#stopHeartbeat()
    this.#heartbeatTimer = setInterval(() => {
      const heartbeat = ProcessLifecycleMessageSchema.parse({
        type: "process.heartbeat",
        version: 1,
        processNonce: this.#processNonce,
        sentAt: Date.now(),
      })
      if (heartbeat.type !== "process.heartbeat") {
        this.#scheduleReconnect(new ClusterError("internal_failure"))
        return
      }
      try {
        this.#connection?.heartbeat(heartbeat)
      } catch (error) {
        this.#scheduleReconnect(error instanceof ClusterError ? error : toClusterError(error))
      }
    }, this.#config.registration.heartbeatIntervalMs)
  }

  #stopHeartbeat(): void {
    if (this.#heartbeatTimer !== undefined) {
      clearInterval(this.#heartbeatTimer)
      this.#heartbeatTimer = undefined
    }
  }

  #scheduleReconnect(error = new ClusterError("protocol_incompatible")): void {
    if (this.#disposed || this.#reconnectTask !== undefined) {
      return
    }
    this.#stopHeartbeat()
    this.#connection = undefined
    this.#state.disconnected(error.code)
    const reconnectTask = this.#establish()
      .catch((failure: unknown) => {
        if (!this.#disposed) {
          this.#state.setError(toClusterError(failure).code)
        }
      })
      .finally(() => {
        if (this.#reconnectTask === reconnectTask) {
          this.#reconnectTask = undefined
        }
      })
    this.#reconnectTask = reconnectTask
  }

  #leaderFailed(leader: LeaderServer | undefined, error: ClusterError): void {
    if (leader !== undefined && this.#leader === leader) {
      this.#leader = undefined
      this.#state.setLeaderSnapshot(undefined)
      this.#scheduleReconnect(error)
    }
  }

  #requireConnection(): ClusterConnection {
    if (!this.#state.status().connected || this.#connection === undefined)
      throw new ClusterError("member_not_registered")
    return this.#connection
  }

  #delayForAttempt(attempt: number): Promise<void> {
    const exponential = this.#config.reconnect.initialDelayMs * 2 ** attempt
    const bounded = Math.min(exponential, this.#config.reconnect.maxDelayMs)
    const jittered = Math.max(1, Math.floor(bounded * (0.5 + Math.random() * 0.5)))
    return Bun.sleep(jittered)
  }
}

export type { ClusterMemberStatus } from "./member-state.ts"
