import {
  createInternalAuthResponse,
  type HostSecret,
  initializeHostSecret,
} from "@opencode-dispatch/broker/security"
import {
  BrokerEpochSchema,
  LoopbackServerUrlSchema,
  MAX_TITLE_LENGTH,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"
import { z } from "zod"

import {
  DISPATCH_CONTROL_ERROR_CODES,
  DispatchControlError,
  type DispatchControlPort,
  type DispatchSnapshot,
} from "./types.ts"

const CONTROL_BINDING = "dispatch.tui.control:v1"
const CHALLENGE_PATH = "/.well-known/opencode-dispatch/tui/challenge"
const CONTROL_PATH = "/.well-known/opencode-dispatch/tui/control"
const DEFAULT_ORIGIN = "http://127.0.0.1:43110"
const DEFAULT_POLL_INTERVAL_MS = 2_000
const REQUEST_TIMEOUT_MS = 5_000

const ChallengeSchema = z
  .strictObject({
    issuedAtMs: z.number().int().nonnegative(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{22}$/u),
  })
  .readonly()
const ChallengeResponseSchema = z
  .strictObject({
    type: z.literal("dispatch_tui_challenge"),
    version: z.literal(1),
    challenge: ChallengeSchema,
  })
  .readonly()
const SessionSchema = z
  .strictObject({
    id: SessionIdSchema,
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
    live: z.boolean(),
    enabled: z.boolean(),
  })
  .readonly()
const StableUrlSchema = z.url().refine((value) => {
  const url = new URL(value)
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  )
})
const TailscaleSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), stableUrl: StableUrlSchema }),
  z.strictObject({ kind: z.literal("cli_missing") }),
  z.strictObject({ kind: z.literal("cli_failed") }),
  z.strictObject({ kind: z.literal("version_unsupported") }),
  z.strictObject({ kind: z.literal("status_invalid") }),
  z.strictObject({ kind: z.literal("logged_out") }),
  z.strictObject({ kind: z.literal("magicdns_unavailable") }),
  z.strictObject({ kind: z.literal("https_unavailable"), stableUrl: StableUrlSchema }),
  z.strictObject({ kind: z.literal("serve_off"), stableUrl: StableUrlSchema }),
  z.strictObject({ kind: z.literal("serve_misconfigured"), stableUrl: StableUrlSchema }),
])
const SnapshotSchema = z
  .strictObject({
    brokerEpoch: BrokerEpochSchema.optional(),
    connected: z.boolean(),
    sessions: z.array(SessionSchema).max(256).readonly(),
    tailscale: TailscaleSchema,
    diagnostics: z
      .strictObject({
        broker: z.enum(["connected", "disconnected", "reconnected", "unavailable"]),
        registration: z.enum(["live", "expired", "missing", "ambiguous"]),
      })
      .readonly(),
  })
  .readonly()
const SnapshotResponseSchema = z
  .strictObject({
    type: z.literal("dispatch_tui_snapshot"),
    version: z.literal(1),
    snapshot: SnapshotSchema,
  })
  .readonly()
const ErrorResponseSchema = z
  .strictObject({ code: z.enum(DISPATCH_CONTROL_ERROR_CODES) })
  .readonly()

type ControlOperation =
  | { readonly type: "status" }
  | { readonly type: "enable"; readonly sessionId: string; readonly title: string }
  | { readonly type: "disable"; readonly sessionId: string }

type FetchRequest = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>

type LocalDispatchControlClientInput = {
  readonly origin?: string
  readonly fetchRequest?: FetchRequest
  readonly loadSecret?: () => Promise<HostSecret>
  readonly pollIntervalMs?: number
}

async function readJson(response: Response, code: "foreign_listener" | "malformed_response") {
  try {
    const value: unknown = await response.json()
    return value
  } catch (error) {
    if (error instanceof SyntaxError) throw new DispatchControlError(code)
    throw error
  }
}

function parseOrigin(value: string): string {
  const parsed = LoopbackServerUrlSchema.safeParse(value)
  if (!parsed.success) throw new DispatchControlError("control_rejected")
  const url = new URL(parsed.data)
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new DispatchControlError("control_rejected")
  }
  return url.origin
}

export function createLocalDispatchControlClient(
  input: LocalDispatchControlClientInput = {},
): DispatchControlPort {
  const origin = parseOrigin(input.origin ?? DEFAULT_ORIGIN)
  const fetchRequest = input.fetchRequest ?? fetch
  const loadSecret = input.loadSecret ?? initializeHostSecret
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const listeners = new Set<(snapshot: DispatchSnapshot) => void>()
  const lifecycle = new AbortController()
  let disposed = false
  let timer: ReturnType<typeof setInterval> | undefined

  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new DispatchControlError("control_rejected")
  }

  const request = async (operation: ControlOperation): Promise<DispatchSnapshot> => {
    if (disposed) throw new DispatchControlError("control_rejected")
    try {
      const challengeResponse = await fetchRequest(`${origin}${CHALLENGE_PATH}`, {
        method: "GET",
        signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      })
      if (!challengeResponse.ok) throw new DispatchControlError("foreign_listener")
      const challenge = ChallengeResponseSchema.safeParse(
        await readJson(challengeResponse, "foreign_listener"),
      )
      if (!challenge.success) throw new DispatchControlError("foreign_listener")
      const auth = createInternalAuthResponse(
        await loadSecret(),
        challenge.data.challenge,
        CONTROL_BINDING,
      )
      const response = await fetchRequest(`${origin}${CONTROL_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1, auth, operation }),
        signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      })
      const value = await readJson(response, "malformed_response")
      if (!response.ok) {
        const parsedError = ErrorResponseSchema.safeParse(value)
        throw new DispatchControlError(
          parsedError.success ? parsedError.data.code : "control_rejected",
        )
      }
      const parsed = SnapshotResponseSchema.safeParse(value)
      if (!parsed.success) throw new DispatchControlError("malformed_response")
      for (const listener of listeners) listener(parsed.data.snapshot)
      return parsed.data.snapshot
    } catch (error) {
      if (error instanceof DispatchControlError) throw error
      if (error instanceof TypeError || error instanceof DOMException) {
        throw new DispatchControlError("broker_unavailable")
      }
      throw new DispatchControlError("control_rejected")
    }
  }

  const poll = async (): Promise<void> => {
    try {
      await request({ type: "status" })
    } catch (error) {
      if (error instanceof DispatchControlError) return
      throw error
    }
  }

  return {
    snapshot: () => request({ type: "status" }),
    enable: (operation) =>
      request({
        type: "enable",
        sessionId: SessionIdSchema.parse(operation.sessionId),
        title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).parse(operation.title),
      }),
    disable: (sessionId) =>
      request({ type: "disable", sessionId: SessionIdSchema.parse(sessionId) }),
    subscribe: (listener) => {
      listeners.add(listener)
      timer ??= setInterval(() => void poll(), pollIntervalMs)
      let active = true
      return () => {
        if (!active) return
        active = false
        listeners.delete(listener)
        if (listeners.size === 0 && timer !== undefined) {
          clearInterval(timer)
          timer = undefined
        }
      }
    },
    dispose: async () => {
      if (disposed) return
      disposed = true
      lifecycle.abort()
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
      listeners.clear()
    },
  }
}
