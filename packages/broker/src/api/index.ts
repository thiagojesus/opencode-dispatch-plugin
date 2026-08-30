import { SessionEventHub } from "../events/hub.ts"
import type { BrokerHttpRouter, BrokerHttpRouterOptions } from "./ports.ts"
import { createRemoteRouter } from "./remote-router.ts"
import { createTuiRouter } from "./tui-router.ts"

export { API_ROUTE_MANIFEST, TUI_ROUTE_MANIFEST } from "./manifest.ts"
export type {
  ApiClusterPort,
  ApiEventPort,
  ApiOpenCodePort,
  ApiRateLimitConfig,
  BrokerHttpRouter,
  BrokerHttpRouterOptions,
  BrokerRequestIngress,
} from "./ports.ts"

export function createBrokerHttpRouter(options: BrokerHttpRouterOptions): BrokerHttpRouter {
  const events =
    options.events ??
    new SessionEventHub({
      brokerEpoch: options.cluster.snapshot().brokerEpoch,
      now: options.now,
      replayLimit: 256,
    })
  const configuredOptions = { ...options, events }
  const remote = createRemoteRouter(configuredOptions)
  const tui = createTuiRouter(configuredOptions)
  return {
    async handle(request, ingress) {
      const localResponse = await tui.handle(request, ingress)
      if (localResponse !== undefined) return localResponse
      const pathname = new URL(request.url).pathname
      if (pathname.startsWith("/api/")) return remote.handle(request, ingress)
      return Response.json({ error: "route_not_found" }, { status: 404 })
    },
    prepareEventStream: remote.prepareEventStream,
    publishSignal: remote.publishSignal,
    revokeSession(sessionId, reason) {
      events.revoke(sessionId, reason)
    },
    subscribeEvents: remote.subscribeEvents,
  }
}
