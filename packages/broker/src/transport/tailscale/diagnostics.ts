import { CONTROL_CAPABILITY, TailscaleLoginSchema } from "@opencode-dispatch/contracts"
import { z } from "zod"

import { createTrustedBrowserEndpoint } from "../../security/index.ts"
import type {
  TailscaleCliResult,
  TailscaleCommandRunner,
  TailscaleReadCommand,
  TailscaleServeMisconfiguration,
  TailscaleSetupState,
} from "./types.ts"

const MINIMUM_VERSION = [1, 92, 0] as const
const HTTPS_CAPABILITY = "https"
const BROKER_TARGET = "http://127.0.0.1:43110"
const BaseStatusSchema = z.object({ BackendState: z.string() })
const RunningStatusSchema = BaseStatusSchema.extend({
  CertDomains: z.array(z.string()).nullable().optional(),
  CurrentTailnet: z.object({
    MagicDNSEnabled: z.boolean(),
    MagicDNSSuffix: z.string().min(1),
  }),
  Self: z.object({
    CapMap: z.record(z.string(), z.array(z.unknown()).nullable()).optional(),
    DNSName: z.string().min(1),
    HostName: z.string().min(1),
    UserID: z.number().int().nonnegative(),
  }),
  User: z.record(z.string(), z.unknown()).optional(),
})
const UserProfileSchema = z.object({ LoginName: TailscaleLoginSchema })
const HandlerSchema = z.object({
  AcceptAppCaps: z.array(z.string()).optional(),
  Proxy: z.string().optional(),
})
const ServeConfigSchema = z
  .object({
    AllowFunnel: z.record(z.string(), z.boolean()).nullable().optional(),
    Foreground: z.record(z.string(), z.unknown()).nullable().optional(),
    TCP: z
      .record(z.string(), z.object({ HTTPS: z.boolean().optional() }))
      .nullable()
      .optional(),
    Web: z
      .record(z.string(), z.object({ Handlers: z.record(z.string(), HandlerSchema).optional() }))
      .nullable()
      .optional(),
  })
  .nullable()

type ParsedVersion = {
  readonly label: string
  readonly parts: readonly [number, number, number]
}

type JsonResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false }

function parseJson(value: string): JsonResult {
  try {
    const parsed: unknown = JSON.parse(value)
    return { ok: true, value: parsed }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false }
    }
    throw error
  }
}

function parseVersion(output: string): ParsedVersion | undefined {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/u.exec(output.trim())
  const major = match?.[1]
  const minor = match?.[2]
  if (major === undefined || minor === undefined) {
    return undefined
  }
  const patch = match?.[3] ?? "0"
  return {
    label: `${major}.${minor}.${patch}`,
    parts: [Number(major), Number(minor), Number(patch)],
  }
}

function isSupportedVersion(version: ParsedVersion): boolean {
  for (let index = 0; index < MINIMUM_VERSION.length; index += 1) {
    const actual = version.parts[index]
    const minimum = MINIMUM_VERSION[index]
    if (actual === undefined || minimum === undefined) {
      return false
    }
    if (actual > minimum) {
      return true
    }
    if (actual < minimum) {
      return false
    }
  }
  return true
}

function completed(
  result: TailscaleCliResult,
): result is Extract<TailscaleCliResult, { kind: "completed" }> {
  return result.kind === "completed" && result.exitCode === 0
}

function cliFailure(command: TailscaleReadCommand): TailscaleSetupState {
  return { kind: "cli_failed", command }
}

function serveMisconfigured(
  allowedLogin: z.infer<typeof TailscaleLoginSchema>,
  stableUrl: string,
  reason: TailscaleServeMisconfiguration,
): TailscaleSetupState {
  return { kind: "serve_misconfigured", allowedLogin, stableUrl, reason }
}

export async function inspectTailscaleSetup(
  runner: TailscaleCommandRunner,
): Promise<TailscaleSetupState> {
  const versionCommand = ["version"] as const
  const versionResult = await runner(versionCommand)
  if (versionResult.kind === "unavailable") {
    return { kind: "cli_missing" }
  }
  if (!completed(versionResult)) {
    return cliFailure(versionCommand)
  }
  const version = parseVersion(versionResult.stdout)
  if (version === undefined) {
    return { kind: "version_unsupported", version: "unknown" }
  }
  if (!isSupportedVersion(version)) {
    return { kind: "version_unsupported", version: version.label }
  }
  const statusCommand = ["status", "--json"] as const
  const statusResult = await runner(statusCommand)
  if (!completed(statusResult)) {
    return cliFailure(statusCommand)
  }
  const statusJson = parseJson(statusResult.stdout)
  if (!statusJson.ok) {
    return { kind: "status_invalid" }
  }
  const baseStatus = BaseStatusSchema.safeParse(statusJson.value)
  if (!baseStatus.success) {
    return { kind: "status_invalid" }
  }
  if (baseStatus.data.BackendState !== "Running") {
    return { kind: "logged_out", backendState: baseStatus.data.BackendState }
  }
  const status = RunningStatusSchema.safeParse(statusJson.value)
  if (!status.success) {
    return { kind: "status_invalid" }
  }
  if (!status.data.CurrentTailnet.MagicDNSEnabled) {
    return { kind: "magicdns_unavailable" }
  }
  const dnsName = status.data.Self.DNSName.replace(/\.$/u, "")
  let stableUrl: string
  try {
    stableUrl = createTrustedBrowserEndpoint(`https://${dnsName}`).origin
  } catch {
    return { kind: "status_invalid" }
  }
  const capMap = status.data.Self.CapMap ?? {}
  const certDomains = status.data.CertDomains ?? []
  if (!(HTTPS_CAPABILITY in capMap) || !certDomains.includes(dnsName)) {
    return {
      kind: "https_unavailable",
      machineName: status.data.Self.HostName,
      stableUrl,
      warning: "certificate_transparency_public_name",
    }
  }
  const profile = UserProfileSchema.safeParse(status.data.User?.[String(status.data.Self.UserID)])
  if (!profile.success) {
    return { kind: "status_invalid" }
  }
  const allowedLogin = profile.data.LoginName
  const serveCommand = ["serve", "status", "--json"] as const
  const serveResult = await runner(serveCommand)
  if (!completed(serveResult)) {
    return cliFailure(serveCommand)
  }
  const serveJson = parseJson(serveResult.stdout)
  if (!serveJson.ok) {
    return serveMisconfigured(allowedLogin, stableUrl, "https_mapping_missing")
  }
  const serve = ServeConfigSchema.safeParse(serveJson.value)
  if (!serve.success) {
    return serveMisconfigured(allowedLogin, stableUrl, "https_mapping_missing")
  }
  if (serve.data === null) {
    return { kind: "serve_off", allowedLogin, stableUrl }
  }
  if (Object.values(serve.data.AllowFunnel ?? {}).includes(true)) {
    return serveMisconfigured(allowedLogin, stableUrl, "funnel_enabled")
  }
  if (Object.keys(serve.data.Foreground ?? {}).length > 0) {
    return serveMisconfigured(allowedLogin, stableUrl, "foreground_configuration")
  }
  const hostname = new URL(stableUrl).hostname
  const handler = serve.data.Web?.[`${hostname}:443`]?.Handlers?.["/"]
  if (serve.data.TCP?.["443"]?.HTTPS !== true || handler === undefined) {
    return serveMisconfigured(allowedLogin, stableUrl, "https_mapping_missing")
  }
  if (handler.Proxy !== BROKER_TARGET) {
    return serveMisconfigured(allowedLogin, stableUrl, "target_invalid")
  }
  if (handler.AcceptAppCaps?.length !== 1 || handler.AcceptAppCaps[0] !== CONTROL_CAPABILITY) {
    return serveMisconfigured(allowedLogin, stableUrl, "capability_forwarding_invalid")
  }
  return {
    kind: "ready",
    allowedLogin,
    grantVerification: "per_request",
    machineName: status.data.Self.HostName,
    stableUrl,
  }
}
