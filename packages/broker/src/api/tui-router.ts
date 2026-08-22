import {
  assertNever,
  MAX_TITLE_LENGTH,
  PROTOCOL_VERSION,
  ProcessExposureSchema,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"
import { z } from "zod"

import {
  createSecurityHeaders,
  FixedWindowRateLimiter,
  InternalAuthVerifier,
  readBodyWithinLimit,
} from "../security/index.ts"
import type { TailscaleSetupState } from "../transport/tailscale/index.ts"
import type { BrokerHttpRouterOptions, BrokerRequestIngress } from "./ports.ts"

const CHALLENGE_PATH = "/.well-known/opencode-dispatch/tui/challenge"
const CONTROL_PATH = "/.well-known/opencode-dispatch/tui/control"
const CONTROL_BINDING = "dispatch.tui.control:v1"
const CONTROL_BODY_LIMIT = 4_096
const PROTECTED_HEADERS = ["tailscale-app-capabilities", "tailscale-user-login"] as const

const AuthSchema = z.strictObject({
  issuedAtMs: z.number().int().nonnegative(),
  nonce: z.string(),
  signature: z.string(),
})
const OperationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("status") }),
  z.strictObject({
    type: z.literal("enable"),
    sessionId: SessionIdSchema,
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  }),
  z.strictObject({ type: z.literal("disable"), sessionId: SessionIdSchema }),
])
const ControlRequestSchema = z.strictObject({
  version: z.literal(PROTOCOL_VERSION),
  auth: AuthSchema,
  operation: OperationSchema,
})

type TuiRouter = {
  handle(request: Request, ingress: BrokerRequestIngress): Promise<Response | undefined>
}

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: createSecurityHeaders("api") })
}

function controlError(status: number): Response {
  return response({ code: "control_rejected" }, status)
}

function tailscaleSummary(state: TailscaleSetupState): Readonly<Record<string, unknown>> {
  switch (state.kind) {
    case "ready":
      return { kind: "ready", stableUrl: state.stableUrl }
    case "cli_missing":
      return { kind: "cli_missing" }
    case "cli_failed":
      return { kind: "cli_failed" }
    case "version_unsupported":
      return { kind: "version_unsupported" }
    case "status_invalid":
      return { kind: "status_invalid" }
    case "logged_out":
      return { kind: "logged_out" }
    case "magicdns_unavailable":
      return { kind: "magicdns_unavailable" }
    case "https_unavailable":
      return { kind: "https_unavailable", stableUrl: state.stableUrl }
    case "serve_off":
      return { kind: "serve_off", stableUrl: state.stableUrl }
    case "serve_misconfigured":
      return { kind: "serve_misconfigured", stableUrl: state.stableUrl }
    default:
      return assertNever(state)
  }
}

async function parseControlRequest(request: Request): Promise<unknown> {
  const decision = await readBodyWithinLimit(request, CONTROL_BODY_LIMIT)
  if (!decision.ok) throw new TypeError("control body rejected")
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decision.value))
}

export function createTuiRouter(options: BrokerHttpRouterOptions): TuiRouter {
  const verifier = new InternalAuthVerifier(options.hostSecret, {
    challengeTtlMs: 5_000,
    maxChallenges: 256,
    now: options.now,
  })
  const limiter = new FixedWindowRateLimiter({
    limit: 120,
    maxSubjects: 1,
    now: options.now,
    windowMs: 60_000,
  })

  const snapshot = async () => {
    const cluster = options.cluster.snapshot()
    const exposures = new Map(cluster.exposures.map((item) => [item.sessionId, item]))
    let ambiguous = false
    const sessions = []
    for (const sessionId of options.openCode.sessionIds()) {
      try {
        options.openCode.resolveOwner(sessionId)
        const session = await options.openCode.get(sessionId)
        const title = z
          .object({ title: z.string().trim().min(1).max(MAX_TITLE_LENGTH) })
          .safeParse(session)
        if (!title.success) throw new TypeError("invalid session title")
        sessions.push({
          id: sessionId,
          title: title.data.title,
          live: true,
          enabled: exposures.has(sessionId),
        })
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ownership_ambiguous") {
          ambiguous = true
        }
      }
    }
    sessions.sort((left, right) => left.id.localeCompare(right.id))
    const connected = cluster.members.length > 0
    const registration = ambiguous
      ? "ambiguous"
      : connected
        ? sessions.length > 0
          ? "live"
          : "missing"
        : options.openCode.sessionIds().length > 0
          ? "expired"
          : "missing"
    return {
      type: "dispatch_tui_snapshot",
      version: PROTOCOL_VERSION,
      snapshot: {
        brokerEpoch: cluster.brokerEpoch,
        connected,
        sessions,
        tailscale: tailscaleSummary(await options.inspectTailscale()),
        diagnostics: {
          broker: connected ? "connected" : "unavailable",
          registration,
        },
      },
    }
  }

  const mutate = async (operation: z.infer<typeof OperationSchema>): Promise<Response> => {
    switch (operation.type) {
      case "status":
        return response(await snapshot())
      case "enable": {
        if (!options.openCode.sessionIds().includes(operation.sessionId)) {
          return response({ code: "session_missing" }, 404)
        }
        const processNonce = options.openCode.resolveOwner(operation.sessionId)
        const current = options.cluster
          .snapshot()
          .exposures.find((candidate) => candidate.sessionId === operation.sessionId)
        if (current !== undefined && current.processNonce !== processNonce) {
          return controlError(409)
        }
        if (current === undefined) {
          await options.cluster.enable(
            ProcessExposureSchema.parse({
              version: PROTOCOL_VERSION,
              processNonce,
              sessionId: operation.sessionId,
              title: operation.title,
              enabledAt: options.now(),
            }),
          )
        }
        return response(await snapshot())
      }
      case "disable": {
        const current = options.cluster
          .snapshot()
          .exposures.find((candidate) => candidate.sessionId === operation.sessionId)
        if (current !== undefined) {
          await options.cluster.disable(current.processNonce, operation.sessionId)
        }
        return response(await snapshot())
      }
      default:
        return assertNever(operation)
    }
  }

  const handle = async (
    request: Request,
    ingress: BrokerRequestIngress,
  ): Promise<Response | undefined> => {
    const url = new URL(request.url)
    if (url.pathname !== CHALLENGE_PATH && url.pathname !== CONTROL_PATH) return undefined
    if (ingress !== "direct" || PROTECTED_HEADERS.some((header) => request.headers.has(header))) {
      return undefined
    }
    if (url.search.length > 0) return controlError(400)
    const permit = limiter.consume("loopback")
    if (!permit.ok) return controlError(429)
    if (url.pathname === CHALLENGE_PATH) {
      if (request.method !== "GET") return controlError(405)
      try {
        return response({
          type: "dispatch_tui_challenge",
          version: PROTOCOL_VERSION,
          challenge: verifier.issueChallenge(),
        })
      } catch {
        return controlError(503)
      }
    }
    if (request.method !== "POST") return controlError(405)
    if (request.headers.get("content-type") !== "application/json") return controlError(415)
    try {
      const parsed = ControlRequestSchema.safeParse(await parseControlRequest(request))
      if (!parsed.success) return controlError(400)
      const auth = verifier.verify(parsed.data.auth, CONTROL_BINDING)
      if (!auth.ok) return controlError(401)
      return await mutate(parsed.data.operation)
    } catch {
      return controlError(400)
    }
  }
  return { handle }
}
