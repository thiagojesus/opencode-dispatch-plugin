import type { BrokerHttpRouter, BrokerHttpRouterOptions } from "./ports.ts"
import { createRemoteRouter } from "./remote-router.ts"
import { createTuiRouter } from "./tui-router.ts"

export { API_ROUTE_MANIFEST, TUI_ROUTE_MANIFEST } from "./manifest.ts"
export type {
  ApiClusterPort,
  ApiOpenCodePort,
  ApiRateLimitConfig,
  BrokerHttpRouter,
  BrokerHttpRouterOptions,
  BrokerRequestIngress,
} from "./ports.ts"

export function createBrokerHttpRouter(options: BrokerHttpRouterOptions): BrokerHttpRouter {
  const remote = createRemoteRouter(options)
  const tui = createTuiRouter(options)
  return {
    async handle(request, ingress) {
      const localResponse = await tui.handle(request, ingress)
      if (localResponse !== undefined) return localResponse
      const pathname = new URL(request.url).pathname
      if (pathname.startsWith("/api/")) return remote.handle(request, ingress)
      return Response.json({ error: "route_not_found" }, { status: 404 })
    },
  }
}
