import type { DispatchConfig } from "@opencode-dispatch/contracts"
import { assertNever, PROTOCOL_VERSION } from "@opencode-dispatch/contracts"
import type { BrokerHttpRouter } from "../api/index.ts"
import { OpenCodeAdapter } from "../opencode/index.ts"
import { type HostSecret, InternalAuthVerifier } from "../security/index.ts"
import { ClusterError, toClusterError } from "./errors.ts"
import { requireAuthenticated, requireOwner } from "./leader-auth.ts"
import {
  type LeaderSocketData,
  sendAcknowledged,
  sendClusterError,
  sendServerFrame,
} from "./leader-frames.ts"
import {
  createLeaderHttpRouter,
  handleClusterHttp,
  startTailscaleServeTarget,
} from "./leader-http.ts"
import { ClusterClientFrameSchema, clusterAuthBinding } from "./protocol.ts"
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
  readonly #httpRouter: BrokerHttpRouter
  readonly #onFailure: (error: ClusterError) => void
  readonly #onSnapshot: (snapshot: ClusterRegistrySnapshot) => void
  readonly #registry: MembershipRegistry
  readonly #serveServer: Bun.Server<undefined>
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
    this.#httpRouter = createLeaderHttpRouter({
      config: options.config,
      hostSecret: options.hostSecret,
      now: options.now,
      openCode: this.openCode,
      persist: () => this.#persist(),
      registry: this.#registry,
    })
    this.#serveServer = startTailscaleServeTarget(options.config.broker.host, this.#httpRouter)
    try {
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
    } catch (error) {
      void this.#serveServer.stop(true)
      throw error
    }
    this.#sweepTimer = setInterval(() => {
      void this.#sweep().catch((error: unknown) => {
        this.#onFailure(toClusterError(error))
        void this.stop()
      })
    }, options.config.registration.heartbeatIntervalMs)
  }

  readonly snapshot = (): ClusterRegistrySnapshot => this.#registry.snapshot()

  async stop(): Promise<void> {
    if (this.#stopping) return
    this.#stopping = true
    clearInterval(this.#sweepTimer)
    await Promise.all([this.#server.stop(true), this.#serveServer.stop(true)])
    this.openCode.dispose()
  }

  async #fetch(
    request: Request,
    server: Bun.Server<LeaderSocketData>,
  ): Promise<Response | undefined> {
    const url = new URL(request.url)
    const clusterRoute = handleClusterHttp({
      authVerifier: this.#authVerifier,
      brokerEpoch: this.#registry.snapshot().brokerEpoch,
      request,
      server,
    })
    if (clusterRoute.matched) return clusterRoute.response
    if (
      url.pathname.startsWith("/api/v1") ||
      url.pathname.startsWith("/.well-known/opencode-dispatch/tui/")
    ) {
      return this.#httpRouter.handle(request, "direct")
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
          requireAuthenticated(socket)
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
          requireOwner(socket, frame.lifecycle.processNonce)
          if (frame.lifecycle.type !== "process.heartbeat") {
            throw new ClusterError("protocol_incompatible")
          }
          this.#registry.heartbeat(frame.lifecycle)
          await this.#persist()
          return
        case "exposure.enable":
          requireOwner(socket, frame.exposure.processNonce)
          this.#registry.enable(frame.exposure)
          await this.#persist()
          sendAcknowledged(socket, frame.brokerEpoch, frame.requestId)
          return
        case "exposure.disable":
          requireOwner(socket, frame.processNonce)
          this.#registry.disable(frame.processNonce, frame.sessionId)
          await this.#persist()
          sendAcknowledged(socket, frame.brokerEpoch, frame.requestId)
          return
        case "opencode.event":
          requireOwner(socket, frame.processNonce)
          this.openCode.observe(frame.processNonce, frame.signal)
          sendAcknowledged(socket, frame.brokerEpoch, frame.requestId)
          return
        case "member.unregister":
          requireOwner(socket, frame.lifecycle.processNonce)
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
