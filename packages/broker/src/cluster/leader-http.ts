import type { DispatchConfig } from "@opencode-dispatch/contracts"

import { type BrokerHttpRouter, createBrokerHttpRouter } from "../api/index.ts"
import type { OpenCodeAdapter } from "../opencode/index.ts"
import type { HostSecret, InternalAuthVerifier } from "../security/index.ts"
import {
  createTailscaleCliRunner,
  inspectTailscaleSetup,
  TAILSCALE_SERVE_TARGET_PORT,
} from "../transport/tailscale/index.ts"
import type { LeaderSocketData } from "./leader-frames.ts"
import { CLUSTER_HEALTH_PATH, CLUSTER_MEMBER_PATH, CLUSTER_SERVICE } from "./protocol.ts"
import type { MembershipRegistry } from "./registry.ts"

type LeaderHttpOptions = {
  readonly config: DispatchConfig
  readonly hostSecret: HostSecret
  readonly now: () => number
  readonly openCode: OpenCodeAdapter
  readonly persist: () => Promise<void>
  readonly registry: MembershipRegistry
}

export function createLeaderHttpRouter(options: LeaderHttpOptions): BrokerHttpRouter {
  const tailscaleRunner = createTailscaleCliRunner()
  return createBrokerHttpRouter({
    backendOrigin: `http://${options.config.broker.host}:${options.config.broker.port}`,
    cluster: {
      snapshot: () => options.registry.snapshot(),
      enable: async (exposure) => {
        options.registry.enable(exposure)
        await options.persist()
      },
      disable: async (processNonce, sessionId) => {
        options.registry.disable(processNonce, sessionId)
        await options.persist()
      },
    },
    hostSecret: options.hostSecret,
    inspectTailscale: () => inspectTailscaleSetup(tailscaleRunner),
    now: options.now,
    openCode: options.openCode,
  })
}

export function startTailscaleServeTarget(
  hostname: string,
  router: BrokerHttpRouter,
): Bun.Server<undefined> {
  return Bun.serve({
    hostname,
    port: TAILSCALE_SERVE_TARGET_PORT,
    fetch(request) {
      if (new URL(request.url).pathname.startsWith("/api/v1")) {
        return router.handle(request, "trusted_proxy")
      }
      return Response.json({ error: "route_not_found" }, { status: 404 })
    },
  })
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
