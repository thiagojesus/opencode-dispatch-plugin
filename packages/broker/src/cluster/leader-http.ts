import type { DispatchConfig } from "@opencode-dispatch/contracts"

import { type BrokerHttpRouter, createBrokerHttpRouter } from "../api/index.ts"
import type { SessionEventHub } from "../events/hub.ts"
import type { OpenCodeAdapter } from "../opencode/index.ts"
import type { HostSecret, InternalAuthVerifier } from "../security/index.ts"
import {
  createTailscaleCliRunner,
  inspectTailscaleSetup,
  TAILSCALE_SERVE_TARGET_PORT,
} from "../transport/tailscale/index.ts"
import type { LeaderSocketData } from "./leader-frames.ts"
import { CLUSTER_HEALTH_PATH, CLUSTER_MEMBER_PATH, CLUSTER_SERVICE } from "./protocol.ts"
import { DEFAULT_PWA_ASSET_DIRECTORY, servePwaAsset } from "./pwa-assets.ts"
import type { MembershipRegistry } from "./registry.ts"

type LeaderHttpOptions = {
  readonly config: DispatchConfig
  readonly events: SessionEventHub
  readonly hostSecret: HostSecret
  readonly now: () => number
  readonly openCode: OpenCodeAdapter
  readonly persist: () => Promise<void>
  readonly registry: MembershipRegistry
}

export function createLeaderHttpRouter(options: LeaderHttpOptions): BrokerHttpRouter {
  const tailscaleRunner = createTailscaleCliRunner()
  let router: BrokerHttpRouter | undefined
  router = createBrokerHttpRouter({
    backendOrigin: `http://${options.config.broker.host}:${options.config.broker.port}`,
    cluster: {
      snapshot: () => options.registry.snapshot(),
      enable: async (exposure) => {
        options.registry.enable(exposure)
        await options.persist()
        await router?.publishSignal(exposure.processNonce, {
          eventType: "session.status",
          observedAt: exposure.enabledAt,
          sessionId: exposure.sessionId,
          source: "seed",
        })
      },
      disable: async (processNonce, sessionId) => {
        options.registry.disable(processNonce, sessionId)
        await options.persist()
        options.events.revoke(sessionId, "disabled")
      },
    },
    events: options.events,
    hostSecret: options.hostSecret,
    inspectTailscale: () => inspectTailscaleSetup(tailscaleRunner),
    now: options.now,
    openCode: options.openCode,
  })
  return router
}

type EventSocketData = {
  readonly router: BrokerHttpRouter
  unsubscribe?: () => void
}

export function startTailscaleServeTarget(
  hostname: string,
  router: BrokerHttpRouter,
  assetDirectory = DEFAULT_PWA_ASSET_DIRECTORY,
): Bun.Server<EventSocketData> {
  return Bun.serve<EventSocketData>({
    hostname,
    port: TAILSCALE_SERVE_TARGET_PORT,
    fetch: async (request, server) => {
      if (new URL(request.url).pathname === "/api/v1/events") {
        const denial = await router.prepareEventStream(request, "trusted_proxy")
        if (denial !== undefined) return denial
        if (server.upgrade(request, { data: { router } })) return undefined
        return Response.json({ error: "websocket_upgrade_required" }, { status: 426 })
      }
      return createTailscaleServeFetch(router, assetDirectory)(request)
    },
    websocket: {
      maxPayloadLength: 1_024 * 1_024,
      message(socket, message) {
        if (socket.data.unsubscribe !== undefined) {
          socket.close(1_008, "duplicate_subscription")
          return
        }
        try {
          const input: unknown = JSON.parse(String(message))
          socket.data.unsubscribe = socket.data.router.subscribeEvents(input, {
            close: (code, reason) => socket.close(code, reason),
            send: (frame) => socket.send(JSON.stringify(frame)),
          })
        } catch {
          socket.close(1_008, "invalid_subscription")
        }
      },
      close(socket) {
        socket.data.unsubscribe?.()
        delete socket.data.unsubscribe
      },
    },
  })
}

export function createTailscaleServeFetch(router: BrokerHttpRouter, assetDirectory: string) {
  return (request: Request): Promise<Response> => {
    const pathname = new URL(request.url).pathname
    if (pathname === "/api/v1" || pathname.startsWith("/api/v1/")) {
      return router.handle(request, "trusted_proxy")
    }
    return servePwaAsset(request, assetDirectory)
  }
}

type ClusterHttpOptions = {
  readonly authVerifier: InternalAuthVerifier
  readonly brokerEpoch: string
  readonly request: Request
  readonly server: Bun.Server<LeaderSocketData>
}

type ClusterHttpResult =
  | { readonly matched: false }
  | { readonly matched: true; readonly response: Response | undefined }

export function handleClusterHttp(options: ClusterHttpOptions): ClusterHttpResult {
  const url = new URL(options.request.url)
  if (options.request.method === "GET" && url.pathname === CLUSTER_HEALTH_PATH) {
    return {
      matched: true,
      response: Response.json({
        type: "cluster.health",
        version: 1,
        service: CLUSTER_SERVICE,
        brokerEpoch: options.brokerEpoch,
      }),
    }
  }
  if (options.request.method === "GET" && url.pathname === CLUSTER_MEMBER_PATH) {
    const challenge = options.authVerifier.issueChallenge()
    if (options.server.upgrade(options.request, { data: { authenticated: false, challenge } })) {
      return { matched: true, response: undefined }
    }
  }
  return { matched: false }
}
