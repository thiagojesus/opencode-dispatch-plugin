import type { BrokerHttpRouter } from "../api/index.ts"
import type { InternalAuthVerifier } from "../security/index.ts"
import type { LeaderSocketData } from "./leader-frames.ts"
import { handleClusterHttp } from "./leader-http.ts"
import type { ClusterRegistrySnapshot } from "./registry.ts"

type LeaderDirectHttpOptions = {
  readonly authVerifier: InternalAuthVerifier
  readonly brokerEpoch: ClusterRegistrySnapshot["brokerEpoch"]
  readonly httpRouter: BrokerHttpRouter
  readonly request: Request
  readonly server: Bun.Server<LeaderSocketData>
}

export async function handleLeaderDirectHttp(
  options: LeaderDirectHttpOptions,
): Promise<Response | undefined> {
  const clusterRoute = handleClusterHttp({
    authVerifier: options.authVerifier,
    brokerEpoch: options.brokerEpoch,
    request: options.request,
    server: options.server,
  })
  if (clusterRoute.matched) return clusterRoute.response
  const pathname = new URL(options.request.url).pathname
  if (
    pathname.startsWith("/api/v1") ||
    pathname.startsWith("/.well-known/opencode-dispatch/tui/")
  ) {
    return options.httpRouter.handle(options.request, "direct")
  }
  return Response.json({ error: "cluster_route_not_found" }, { status: 404 })
}
