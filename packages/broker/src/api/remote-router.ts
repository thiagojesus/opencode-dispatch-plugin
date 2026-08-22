import {
  CapabilitiesResponseSchema,
  CONTROL_ACTIONS,
  CONTROL_CAPABILITY,
  HealthResponseSchema,
  MAX_PAGE_SIZE,
  MAX_PROMPT_BYTES,
  MAX_PUBLIC_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  RemoteActionRequestSchema,
  SessionIdSchema,
  type TransportIdentity,
} from "@opencode-dispatch/contracts"

import {
  createSecurityHeaders,
  directRequestErrorCode,
  FixedWindowRateLimiter,
  readBodyWithinLimit,
} from "../security/index.ts"
import { createTailscaleTransportGuard } from "../transport/tailscale/index.ts"
import { SessionActionService } from "./action-service.ts"
import { SessionAuthority } from "./authority.ts"
import { ApiHttpError, apiErrorFrom, apiErrorResponse, transportErrorFrom } from "./errors.ts"
import type { ApiRateLimitConfig, BrokerHttpRouterOptions, BrokerRequestIngress } from "./ports.ts"
import { SessionReadService } from "./read-service.ts"

const ACTION_BODY_LIMIT = MAX_PROMPT_BYTES + 2_048
const DEFAULT_RATE_LIMIT = {
  maxSubjects: 2_048,
  mutationLimit: 20,
  readLimit: 120,
  windowMs: 60_000,
} as const satisfies ApiRateLimitConfig

type RemoteRouter = {
  handle(request: Request, ingress: BrokerRequestIngress): Promise<Response>
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: createSecurityHeaders("api") })
}

function paginationFrom(url: URL): Readonly<Record<string, unknown>> {
  for (const key of url.searchParams.keys()) {
    if (key !== "cursor" && key !== "limit") throw new ApiHttpError("REQUEST_INVALID")
    if (url.searchParams.getAll(key).length !== 1) throw new ApiHttpError("REQUEST_INVALID")
  }
  const cursor = url.searchParams.get("cursor")
  const limit = url.searchParams.get("limit")
  return {
    ...(cursor === null ? {} : { cursor }),
    ...(limit === null ? {} : { limit: Number(limit) }),
  }
}

function requireNoQuery(url: URL): void {
  if (url.search.length > 0) throw new ApiHttpError("REQUEST_INVALID")
}

function sessionRoute(
  pathname: string,
):
  | { readonly sessionId: ReturnType<typeof SessionIdSchema.parse>; readonly child?: string }
  | undefined {
  const match = /^\/api\/v1\/sessions\/([^/]+)(?:\/(messages|status|todos|pending))?$/u.exec(
    pathname,
  )
  if (match === null) return undefined
  const encodedSessionId = match[1]
  if (encodedSessionId === undefined) throw new ApiHttpError("REQUEST_INVALID")
  let decoded: string
  try {
    decoded = decodeURIComponent(encodedSessionId)
  } catch (error) {
    if (error instanceof URIError) throw new ApiHttpError("REQUEST_INVALID")
    throw error
  }
  const sessionId = SessionIdSchema.safeParse(decoded)
  if (!sessionId.success) throw new ApiHttpError("REQUEST_INVALID")
  return { sessionId: sessionId.data, ...(match[2] === undefined ? {} : { child: match[2] }) }
}

async function parseActionBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type") !== "application/json") {
    throw new ApiHttpError("CONTENT_TYPE_REQUIRED")
  }
  const decision = await readBodyWithinLimit(request, ACTION_BODY_LIMIT)
  if (!decision.ok) throw new ApiHttpError("BODY_TOO_LARGE")
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decision.value))
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      throw new ApiHttpError("REQUEST_INVALID")
    }
    throw error
  }
}

export function createRemoteRouter(options: BrokerHttpRouterOptions): RemoteRouter {
  const authority = new SessionAuthority(options)
  const reads = new SessionReadService({
    authority,
    cluster: options.cluster,
    openCode: options.openCode,
  })
  const actions = new SessionActionService({
    authority,
    now: options.now,
    openCode: options.openCode,
  })
  const policy = options.rateLimit ?? DEFAULT_RATE_LIMIT
  const readLimiter = new FixedWindowRateLimiter({
    limit: policy.readLimit,
    maxSubjects: policy.maxSubjects,
    now: options.now,
    windowMs: policy.windowMs,
  })
  const mutationLimiter = new FixedWindowRateLimiter({
    limit: policy.mutationLimit,
    maxSubjects: policy.maxSubjects,
    now: options.now,
    windowMs: policy.windowMs,
  })

  const authenticate = async (
    request: Request,
    ingress: BrokerRequestIngress,
  ): Promise<TransportIdentity> => {
    if (ingress === "direct") {
      const code = directRequestErrorCode(request.headers)
      throw new ApiHttpError(
        code === "request_identity_spoofed" ? "IDENTITY_SPOOFED" : "TRANSPORT_REJECTED",
      )
    }
    const setup = await options.inspectTailscale()
    if (setup.kind !== "ready") throw new ApiHttpError("TAILSCALE_UNAVAILABLE")
    const decision = createTailscaleTransportGuard({
      backendOrigin: options.backendOrigin,
      setup,
    })({ headers: request.headers, ingress, requiresOrigin: true })
    if (!decision.ok) throw transportErrorFrom(decision.error)
    return decision.value
  }

  const handle = async (request: Request, ingress: BrokerRequestIngress): Promise<Response> => {
    try {
      if (/%2e|%2f|%5c/iu.test(request.url)) throw new ApiHttpError("REQUEST_INVALID")
      const url = new URL(request.url)
      const identity = await authenticate(request, ingress)
      if (url.pathname === "/api/v1/actions") {
        if (request.method !== "POST") throw new ApiHttpError("METHOD_NOT_ALLOWED")
        requireNoQuery(url)
        const value = await parseActionBody(request)
        const parsed = RemoteActionRequestSchema.safeParse(value)
        if (!parsed.success) throw new ApiHttpError("REQUEST_INVALID")
        const permit = mutationLimiter.consume(`${identity.login}\n${parsed.data.sessionId}`)
        if (!permit.ok) throw new ApiHttpError("RATE_LIMITED")
        return jsonResponse(await actions.execute(identity, parsed.data), 202)
      }
      const permit = readLimiter.consume(`${identity.login}\n${url.pathname}`)
      if (!permit.ok) throw new ApiHttpError("RATE_LIMITED")
      if (url.pathname === "/api/v1/health") {
        if (request.method !== "GET") throw new ApiHttpError("METHOD_NOT_ALLOWED")
        requireNoQuery(url)
        return jsonResponse(
          HealthResponseSchema.parse({ type: "health", version: PROTOCOL_VERSION, status: "ok" }),
        )
      }
      if (url.pathname === "/api/v1/capabilities") {
        if (request.method !== "GET") throw new ApiHttpError("METHOD_NOT_ALLOWED")
        requireNoQuery(url)
        return jsonResponse(
          CapabilitiesResponseSchema.parse({
            type: "capabilities",
            version: PROTOCOL_VERSION,
            controlCapability: CONTROL_CAPABILITY,
            actions: CONTROL_ACTIONS,
            maxPromptBytes: MAX_PROMPT_BYTES,
            maxResponseBytes: MAX_PUBLIC_PAYLOAD_BYTES,
            maxPageSize: MAX_PAGE_SIZE,
          }),
        )
      }
      if (url.pathname === "/api/v1/sessions") {
        if (request.method !== "GET") throw new ApiHttpError("METHOD_NOT_ALLOWED")
        return jsonResponse(await reads.list(paginationFrom(url)))
      }
      const route = sessionRoute(url.pathname)
      if (route === undefined) throw new ApiHttpError("ROUTE_NOT_FOUND")
      if (request.method !== "GET") throw new ApiHttpError("METHOD_NOT_ALLOWED")
      switch (route.child) {
        case undefined:
          requireNoQuery(url)
          return jsonResponse(await reads.snapshot(route.sessionId))
        case "messages":
          return jsonResponse(await reads.messages(route.sessionId, paginationFrom(url)))
        case "status":
          requireNoQuery(url)
          return jsonResponse(await reads.status(route.sessionId))
        case "todos":
          requireNoQuery(url)
          return jsonResponse(await reads.todos(route.sessionId))
        case "pending":
          requireNoQuery(url)
          return jsonResponse(await reads.pending(route.sessionId))
        default:
          throw new ApiHttpError("ROUTE_NOT_FOUND")
      }
    } catch (error) {
      return apiErrorResponse(apiErrorFrom(error))
    }
  }
  return { handle }
}
