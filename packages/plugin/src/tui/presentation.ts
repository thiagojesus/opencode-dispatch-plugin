import { assertNever } from "@opencode-dispatch/contracts"

import {
  DISPATCH_CONTROL_ERROR_CODES,
  type DispatchControlErrorCode,
  type DispatchRoute,
  type DispatchSnapshot,
  type TailscaleSetupSummary,
} from "./types.ts"

const CONTROL_ERROR_MESSAGES = {
  broker_unavailable: "Start OpenCode locally, then run /dispatch again.",
  control_rejected: "The local control request was rejected. Restart OpenCode and try again.",
  foreign_listener: "Another service is using the dispatch port. Stop it before retrying.",
  malformed_response: "The local dispatch response was rejected. Restart OpenCode before retrying.",
  registration_expired: "Open the session in its live OpenCode process, then retry.",
  session_missing: "Open a live session before using this action.",
} satisfies Record<DispatchControlErrorCode, string>

export function isDispatchControlErrorCode(value: unknown): value is DispatchControlErrorCode {
  return typeof value === "string" && DISPATCH_CONTROL_ERROR_CODES.some((code) => code === value)
}

export function controlErrorMessage(error: unknown): string {
  if (error instanceof Error && "code" in error && isDispatchControlErrorCode(error.code)) {
    return CONTROL_ERROR_MESSAGES[error.code]
  }
  return CONTROL_ERROR_MESSAGES.control_rejected
}

export function currentSessionId(route: DispatchRoute): string | undefined {
  if (route.name !== "session" || !("params" in route) || route.params === undefined) {
    return undefined
  }
  const sessionId = route.params.sessionID
  return typeof sessionId === "string" ? sessionId : undefined
}

export function menuSummary(snapshot: DispatchSnapshot, sessionId: string | undefined): string {
  if (sessionId !== undefined) {
    const session = snapshot.sessions.find((item) => item.id === sessionId)
    if (session === undefined) return "Current session is not live in the dispatch broker."
    return `${session.enabled ? "Enabled" : "Disabled"} · ${session.live ? "Live" : "Offline"}`
  }
  const enabled = snapshot.sessions.filter((session) => session.enabled && session.live)
  if (enabled.length === 0) return "No enabled live sessions. Open a session to enable it."
  return `Enabled live sessions: ${enabled.map((session) => session.title).join(", ")}`
}

export function statusMessage(snapshot: DispatchSnapshot): string {
  const live = snapshot.sessions.filter((session) => session.live).length
  const enabled = snapshot.sessions.filter((session) => session.enabled && session.live).length
  return [
    `Broker: ${snapshot.connected ? "connected" : "unavailable"}`,
    `Broker epoch: ${snapshot.brokerEpoch ?? "unavailable"}`,
    `Live sessions: ${live}`,
    `Enabled live sessions: ${enabled}`,
  ].join("\n")
}

export function diagnosticsMessage(snapshot: DispatchSnapshot): string {
  return [
    `Broker: ${snapshot.diagnostics.broker}`,
    `Registration: ${snapshot.diagnostics.registration}`,
    `Broker epoch: ${snapshot.brokerEpoch ?? "unavailable"}`,
    `Tailscale: ${snapshot.tailscale.kind}`,
  ].join("\n")
}

export function tailscaleMessage(setup: TailscaleSetupSummary): string {
  switch (setup.kind) {
    case "ready":
      return `Tailscale Serve is ready.\nRemote host: ${setup.stableUrl}`
    case "cli_missing":
      return "Install Tailscale manually, sign in, enable MagicDNS and HTTPS, then run /dispatch again."
    case "cli_failed":
      return "Tailscale diagnostics failed. Run Tailscale status locally, then retry."
    case "version_unsupported":
      return "Update Tailscale manually to version 1.92 or newer, then retry."
    case "status_invalid":
      return "Tailscale returned an invalid status. Restart Tailscale, then retry."
    case "logged_out":
      return "Sign in to Tailscale manually, then run /dispatch again."
    case "magicdns_unavailable":
      return "Enable MagicDNS in the tailnet before configuring remote access."
    case "https_unavailable":
      return "Enable Tailscale HTTPS manually after reviewing certificate-transparency naming."
    case "serve_off":
      return "Tailscale Serve is off. Review the setup requirements before starting it manually."
    case "serve_misconfigured":
      return "Tailscale Serve does not match the private dispatch configuration. Stop and reconfigure it manually."
    default:
      return assertNever(setup)
  }
}

export function remoteUrl(
  snapshot: DispatchSnapshot,
  sessionId: string | undefined,
): string | undefined {
  if (snapshot.tailscale.kind !== "ready") return undefined
  const base = new URL("/sessions", snapshot.tailscale.stableUrl)
  if (sessionId === undefined) return base.toString().replace(/\/$/u, "")
  const session = snapshot.sessions.find((item) => item.id === sessionId)
  if (session?.enabled !== true || !session.live) return undefined
  base.pathname = `/sessions/${encodeURIComponent(sessionId)}`
  return base.toString()
}
