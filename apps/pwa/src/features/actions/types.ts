import type { RemoteActionRequest, RemoteActionResponse } from "@opencode-dispatch/contracts"

export type ActionAvailability = "active" | "offline" | "revoked"

export interface RemoteActionClient {
  executeAction(request: RemoteActionRequest, signal: AbortSignal): Promise<RemoteActionResponse>
}

export type ActionStatusKind =
  | "accepted"
  | "error"
  | "idle"
  | "offline"
  | "retryable"
  | "revoked"
  | "submitting"

export type ActionStatusState = {
  readonly kind: ActionStatusKind
  readonly label: string
  readonly message: string
  readonly tone: "danger" | "info" | "success" | "warning"
}
