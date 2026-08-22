export type DispatchRoute =
  | { readonly name: "home" }
  | { readonly name: "session"; readonly params: { readonly sessionID: string } }
  | { readonly name: string; readonly params?: Readonly<Record<string, unknown>> }

export type DispatchSession = {
  readonly id: string
  readonly title: string
  readonly live: boolean
  readonly enabled: boolean
}

export type TailscaleSetupSummary =
  | { readonly kind: "ready"; readonly stableUrl: string }
  | { readonly kind: "cli_missing" }
  | { readonly kind: "cli_failed" }
  | { readonly kind: "version_unsupported" }
  | { readonly kind: "status_invalid" }
  | { readonly kind: "logged_out" }
  | { readonly kind: "magicdns_unavailable" }
  | { readonly kind: "https_unavailable"; readonly stableUrl: string }
  | { readonly kind: "serve_off"; readonly stableUrl: string }
  | { readonly kind: "serve_misconfigured"; readonly stableUrl: string }

export type DispatchSnapshot = {
  readonly brokerEpoch?: string | undefined
  readonly connected: boolean
  readonly sessions: readonly DispatchSession[]
  readonly tailscale: TailscaleSetupSummary
  readonly diagnostics: {
    readonly broker: string
    readonly registration: string
  }
}

export const DISPATCH_CONTROL_ERROR_CODES = [
  "broker_unavailable",
  "control_rejected",
  "foreign_listener",
  "malformed_response",
  "registration_expired",
  "session_missing",
] as const
export type DispatchControlErrorCode = (typeof DISPATCH_CONTROL_ERROR_CODES)[number]

export class DispatchControlError extends Error {
  override readonly name = "DispatchControlError"

  constructor(readonly code: DispatchControlErrorCode) {
    super(code)
  }
}

export interface DispatchControlPort {
  snapshot(): Promise<DispatchSnapshot>
  enable(input: { readonly sessionId: string; readonly title: string }): Promise<DispatchSnapshot>
  disable(sessionId: string): Promise<DispatchSnapshot>
  subscribe(listener: (snapshot: DispatchSnapshot) => void): () => void
  dispose(): Promise<void>
}

export type DispatchCommand = {
  readonly name: "dispatch.open"
  readonly title: "Dispatch"
  readonly category: "Plugin"
  readonly namespace: "palette"
  readonly slashName: "dispatch"
  readonly run: () => void | Promise<void>
}

export type DispatchMenuOption = {
  readonly id: "enable" | "disable" | "status" | "tailscale" | "qr" | "copy" | "diagnostics"
  readonly title: string
  readonly description: string
  readonly disabled?: boolean
  readonly onSelect: () => void | Promise<void>
}

export type DispatchMenu = {
  readonly title: string
  readonly summary: string
  readonly options: readonly DispatchMenuOption[]
}

export type DispatchConfirm = {
  readonly title: string
  readonly message: string
  readonly onConfirm: () => void | Promise<void>
}

export type DispatchNotice = {
  readonly title: string
  readonly message: string
}

export interface DispatchTuiHost {
  registerCommand(command: DispatchCommand): () => void
  currentRoute(): DispatchRoute
  sessionTitle(sessionId: string): string | undefined
  showMenu(menu: DispatchMenu): void
  showConfirm(confirm: DispatchConfirm): void
  showAlert(alert: DispatchNotice): void
  toast(toast: DispatchNotice): void
  subscribeSessionStatus(listener: () => void): () => void
}

export type DispatchTuiDependencies = {
  readonly control: DispatchControlPort
  readonly copyText: (value: string) => Promise<void>
  readonly renderQr: (value: string) => string
}
