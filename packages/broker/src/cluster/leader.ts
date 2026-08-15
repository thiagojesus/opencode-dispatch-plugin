import type { DispatchConfig, ProcessInstanceNonce } from "@opencode-dispatch/contracts"
import { assertNever, PROTOCOL_VERSION } from "@opencode-dispatch/contracts"
import { OpenCodeAdapter } from "../opencode/index.ts"
import { type HostSecret, InternalAuthVerifier } from "../security/index.ts"
import { ClusterError, toClusterError } from "./errors.ts"
import {
  type LeaderSocketData,
  sendAcknowledged,
  sendClusterError,
  sendServerFrame,
} from "./leader-frames.ts"
import {
  CLUSTER_HEALTH_PATH,
  CLUSTER_MEMBER_PATH,
  CLUSTER_SERVICE,
  ClusterClientFrameSchema,
  clusterAuthBinding,
} from "./protocol.ts"
import type { ClusterRegistrySnapshot, MembershipRegistry } from "./registry.ts"
import type { ClusterStateStore } from "./state-store.ts"

type LeaderServerOptions = {
  readonly config: DispatchConfig
  readonly hostSecret: HostSecret
  readonly now: () => number
  readonly onFailure: (error: ClusterError) => void
  readonly onSnapshot: (snapshot: ClusterRegistrySnapshot) => void
  readonly registry: MembershipRegistry
  readonly stateStore: ClusterStateStore
}

export class LeaderServer {
  readonly openCode = new OpenCodeAdapter()
  readonly #authVerifier: InternalAuthVerifier
  readonly #onFailure: (error: ClusterError) => void
  readonly #onSnapshot: (snapshot: ClusterRegistrySnapshot) => void
  readonly #registry: MembershipRegistry
  readonly #server: Bun.Server<LeaderSocketData>
  readonly #stateStore: ClusterStateStore
  readonly #sweepTimer: ReturnType<typeof setInterval>
  #stopping = false

  constructor(options: LeaderServerOptions) {
    this.#onFailure = options.onFailure
    this.#onSnapshot = options.onSnapshot
    this.#registry = options.registry
    this.#stateStore = options.stateStore
    this.#authVerifier = new InternalAuthVerifier(options.hostSecret, {
      challengeTtlMs: options.config.registration.ttlMs,
      maxChallenges: 256,
      now: options.now,
    })
    this.#server = Bun.serve<LeaderSocketData>({
      hostname: options.config.broker.host,
      port: options.config.broker.port,
      fetch: (request, server) => this.#fetch(request, server),
      websocket: {
        maxPayloadLength: 1_024 * 1_024,
        open: (socket) => this.#open(socket),
        message: async (socket, message) => this.#message(socket, message),
        close: async (socket) => this.#close(socket),
      },
    })
    this.#sweepTimer = setInterval(() => {
      void this.#sweep().catch((error: unknown) => {
        this.#onFailure(toClusterError(error))
        void this.stop()
      })
    }, options.config.registration.heartbeatIntervalMs)
  }

  snapshot(): ClusterRegistrySnapshot {
    return this.#registry.snapshot()
  }

  async stop(): Promise<void> {
    if (this.#stopping) {
      return
    }
    this.#stopping = true
    clearInterval(this.#sweepTimer)
    await this.#server.stop(true)
    this.openCode.dispose()
  }

  #fetch(request: Request, server: Bun.Server<LeaderSocketData>): Response | undefined {
    const url = new URL(request.url)
    if (request.method === "GET" && url.pathname === CLUSTER_HEALTH_PATH) {
      return Response.json({
        type: "cluster.health",
        version: PROTOCOL_VERSION,
        service: CLUSTER_SERVICE,
        brokerEpoch: this.#registry.snapshot().brokerEpoch,
      })
    }
    if (request.method === "GET" && url.pathname === CLUSTER_MEMBER_PATH) {
      const challenge = this.#authVerifier.issueChallenge()
      if (server.upgrade(request, { data: { authenticated: false, challenge } })) {
        return undefined
      }
    }
    return Response.json({ error: "cluster_route_not_found" }, { status: 404 })
  }

  #open(socket: Bun.ServerWebSocket<LeaderSocketData>): void {
    sendServerFrame(socket, {
      type: "auth.challenge",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#registry.snapshot().brokerEpoch,
      challenge: socket.data.challenge,
    })
  }

  async #message(
    socket: Bun.ServerWebSocket<LeaderSocketData>,
    message: string | BufferSource,
  ): Promise<void> {
    let requestId: string | undefined
    try {
      const value: unknown = JSON.parse(String(message))
      const parsed = ClusterClientFrameSchema.safeParse(value)
      if (!parsed.success) {
        throw new ClusterError("protocol_incompatible")
      }
      const frame = parsed.data
      requestId = "requestId" in frame ? frame.requestId : undefined
      if (frame.brokerEpoch !== this.#registry.snapshot().brokerEpoch) {
        throw new ClusterError("protocol_incompatible")
      }
      switch (frame.type) {
        case "auth.response": {
          const decision = this.#authVerifier.verify(
            frame.response,
            clusterAuthBinding(frame.brokerEpoch),
          )
          if (!decision.ok) {
            sendClusterError(socket, this.#registry.snapshot().brokerEpoch, decision.error.code)
            return
          }
          if (
            frame.response.nonce !== socket.data.challenge.nonce ||
            frame.response.issuedAtMs !== socket.data.challenge.issuedAtMs
          ) {
            sendClusterError(socket, this.#registry.snapshot().brokerEpoch, "auth_invalid")
            return
          }
          socket.data.authenticated = true
          sendServerFrame(socket, {
            type: "auth.accepted",
            version: PROTOCOL_VERSION,
            brokerEpoch: frame.brokerEpoch,
          })
          return
        }
        case "member.register":
          this.#requireAuthenticated(socket)
          if (frame.lifecycle.type !== "process.register") {
            throw new ClusterError("protocol_incompatible")
          }
          this.#registry.register(frame.lifecycle, frame.exposures)
          this.openCode.registerProcess({
            processNonce: frame.lifecycle.processNonce,
            serverUrl: frame.lifecycle.serverUrl,
            ...(frame.authorization === undefined ? {} : { authorization: frame.authorization }),
          })
          for (const signal of frame.signals) {
            this.openCode.observe(frame.lifecycle.processNonce, signal)
          }
          socket.data.processNonce = frame.lifecycle.processNonce
          await this.#persist()
          sendServerFrame(socket, {
            type: "member.registered",
            version: PROTOCOL_VERSION,
            brokerEpoch: frame.brokerEpoch,
          })
          return
        case "member.heartbeat":
          this.#requireOwner(socket, frame.lifecycle.processNonce)
          if (frame.lifecycle.type !== "process.heartbeat") {
            throw new ClusterError("protocol_incompatible")
          }
          this.#registry.heartbeat(frame.lifecycle)
          await this.#persist()
          return
        case "exposure.enable":
          this.#requireOwner(socket, frame.exposure.processNonce)
          this.#registry.enable(frame.exposure)
          await this.#persist()
          sendAcknowledged(socket, frame.brokerEpoch, frame.requestId)
          return
        case "exposure.disable":
          this.#requireOwner(socket, frame.processNonce)
          this.#registry.disable(frame.processNonce, frame.sessionId)
          await this.#persist()
          sendAcknowledged(socket, frame.brokerEpoch, frame.requestId)
          return
        case "opencode.event":
          this.#requireOwner(socket, frame.processNonce)
          this.openCode.observe(frame.processNonce, frame.signal)
          sendAcknowledged(socket, frame.brokerEpoch, frame.requestId)
          return
        case "member.unregister":
          this.#requireOwner(socket, frame.lifecycle.processNonce)
          if (frame.lifecycle.type !== "process.unregister") {
            throw new ClusterError("protocol_incompatible")
          }
          this.#registry.unregister(frame.lifecycle)
          this.openCode.unregisterProcess(frame.lifecycle.processNonce)
          delete socket.data.processNonce
          await this.#persist()
          sendAcknowledged(socket, frame.brokerEpoch, frame.requestId)
          return
        default:
          return assertNever(frame)
      }
    } catch (error) {
      const clusterError = error instanceof ClusterError ? error : toClusterError(error)
      sendClusterError(socket, this.#registry.snapshot().brokerEpoch, clusterError.code, requestId)
    }
  }

  async #close(socket: Bun.ServerWebSocket<LeaderSocketData>): Promise<void> {
    if (this.#stopping || socket.data.processNonce === undefined) {
      return
    }
    this.#registry.remove(socket.data.processNonce)
    this.openCode.unregisterProcess(socket.data.processNonce)
    await this.#persist()
  }

  #requireAuthenticated(socket: Bun.ServerWebSocket<LeaderSocketData>): void {
    if (!socket.data.authenticated) {
      throw new ClusterError("protocol_incompatible")
    }
  }

  #requireOwner(
    socket: Bun.ServerWebSocket<LeaderSocketData>,
    processNonce: ProcessInstanceNonce,
  ): void {
    this.#requireAuthenticated(socket)
    if (socket.data.processNonce !== processNonce) {
      throw new ClusterError("exposure_owner_mismatch")
    }
  }

  async #persist(): Promise<void> {
    await this.#stateStore.save(this.#registry.stateForPersistence())
    this.#onSnapshot(this.#registry.snapshot())
  }

  async #sweep(): Promise<void> {
    const expired = this.#registry.expire()
    for (const processNonce of expired) {
      this.openCode.unregisterProcess(processNonce)
    }
    if (expired.length > 0) {
      await this.#persist()
    }
  }
}
