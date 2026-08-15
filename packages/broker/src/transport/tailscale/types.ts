import type { TailscaleLogin, TransportIdentity } from "@opencode-dispatch/contracts"

export type TailscaleReadCommand =
  | readonly ["version"]
  | readonly ["status", "--json"]
  | readonly ["serve", "status", "--json"]

export type TailscaleCliResult =
  | {
      readonly kind: "completed"
      readonly exitCode: number
      readonly stdout: string
      readonly stderr: string
    }
  | { readonly kind: "unavailable" }

export type TailscaleCommandRunner = (command: TailscaleReadCommand) => Promise<TailscaleCliResult>

export type TailscaleServeMisconfiguration =
  | "capability_forwarding_invalid"
  | "foreground_configuration"
  | "funnel_enabled"
  | "https_mapping_missing"
  | "target_invalid"

type DerivedSetup = {
  readonly allowedLogin: TailscaleLogin
  readonly stableUrl: string
}

export type TailscaleReadySetup = DerivedSetup & {
  readonly kind: "ready"
  readonly grantVerification: "per_request"
  readonly machineName: string
}

export type TailscaleSetupState =
  | { readonly kind: "cli_missing" }
  | { readonly kind: "cli_failed"; readonly command: TailscaleReadCommand }
  | { readonly kind: "version_unsupported"; readonly version: string }
  | { readonly kind: "status_invalid" }
  | { readonly kind: "logged_out"; readonly backendState: string }
  | { readonly kind: "magicdns_unavailable" }
  | {
      readonly kind: "https_unavailable"
      readonly machineName: string
      readonly stableUrl: string
      readonly warning: "certificate_transparency_public_name"
    }
  | (DerivedSetup & { readonly kind: "serve_off" })
  | (DerivedSetup & {
      readonly kind: "serve_misconfigured"
      readonly reason: TailscaleServeMisconfiguration
    })
  | TailscaleReadySetup

export type TailscaleTransportErrorCode =
  | "capability_denied"
  | "capability_malformed"
  | "capability_missing"
  | "host_rejected"
  | "identity_malformed"
  | "identity_mismatch"
  | "identity_missing"
  | "identity_spoofed"
  | "origin_rejected"
  | "transport_rejected"

export type TailscaleTransportDenial = {
  readonly kind: "tailscale_transport_denial"
  readonly code: TailscaleTransportErrorCode
  readonly httpStatus: 401 | 403
}

export type TailscaleTransportDecision =
  | { readonly ok: true; readonly value: TransportIdentity }
  | { readonly ok: false; readonly error: TailscaleTransportDenial }

export type TailscaleRemoteRequest = {
  readonly headers: Headers
  readonly ingress: "direct" | "trusted_proxy"
  readonly requiresOrigin: boolean
}

export type TailscaleTransportGuard = (
  request: TailscaleRemoteRequest,
) => TailscaleTransportDecision

export type TailscaleTransportGuardConfig = {
  readonly backendOrigin: string
  readonly setup: TailscaleReadySetup
}
