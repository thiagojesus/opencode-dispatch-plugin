import { CONTROL_CAPABILITY, LoopbackServerUrlSchema } from "../../packages/contracts/src/index.ts"
import { FixtureConfigurationError } from "./errors.ts"

const PROTECTED_HEADERS = [
  "tailscale-app-capabilities",
  "tailscale-user-login",
  "tailscale-user-name",
  "tailscale-user-profile-pic",
] as const

export type TrustedProxyIdentity = {
  readonly login: string
  readonly name: string
  readonly profilePicture?: string
}

export type TrustedProxyOptions = {
  readonly targetOrigin: string
  readonly identity: TrustedProxyIdentity
  readonly forwardedHost?: string
}

export type ForwardedProxyRequest = {
  readonly method: string
  readonly pathname: string
  readonly headers: Headers
}

export type TrustedProxyFixture = {
  readonly origin: string
  requests(): readonly ForwardedProxyRequest[]
  stop(): Promise<void>
}

export async function startTrustedProxyFixture(
  options: TrustedProxyOptions,
): Promise<TrustedProxyFixture> {
  const targetOrigin = LoopbackServerUrlSchema.parse(options.targetOrigin)
  const target = new URL(targetOrigin)
  if (target.pathname !== "/") {
    throw new FixtureConfigurationError("targetOrigin")
  }
  const requests: ForwardedProxyRequest[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const sourceUrl = new URL(request.url)
      const headers = new Headers(request.headers)
      for (const header of PROTECTED_HEADERS) {
        headers.delete(header)
      }
      headers.delete("host")
      if (options.forwardedHost !== undefined) {
        headers.set("host", options.forwardedHost)
      }
      headers.set("tailscale-user-login", options.identity.login)
      headers.set("tailscale-user-name", options.identity.name)
      if (options.identity.profilePicture !== undefined) {
        headers.set("tailscale-user-profile-pic", options.identity.profilePicture)
      }
      headers.set("tailscale-app-capabilities", JSON.stringify({ [CONTROL_CAPABILITY]: [{}] }))
      requests.push({
        method: request.method,
        pathname: `${sourceUrl.pathname}${sourceUrl.search}`,
        headers: new Headers(headers),
      })
      const body =
        request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer()
      return fetch(new URL(`${sourceUrl.pathname}${sourceUrl.search}`, target), {
        body,
        headers,
        method: request.method,
        redirect: "manual",
      })
    },
  })

  return {
    origin: LoopbackServerUrlSchema.parse(server.url.origin),
    requests: () => requests.slice(),
    stop: () => server.stop(true),
  }
}
