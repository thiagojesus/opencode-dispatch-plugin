export const SECURITY_ERROR_CODES = [
  "state_path_unavailable",
  "state_permissions_invalid",
  "state_io_failed",
  "secret_invalid",
  "auth_malformed",
  "auth_expired",
  "auth_invalid",
  "auth_replayed",
  "auth_capacity_exhausted",
  "request_transport_rejected",
  "request_identity_spoofed",
  "request_host_rejected",
  "request_origin_rejected",
  "request_body_rejected",
  "request_rate_limited",
  "configuration_invalid",
  "internal_failure",
] as const

export type SecurityErrorCode = (typeof SECURITY_ERROR_CODES)[number]

export const SECURITY_OPERATIONS = [
  "resolve_state_path",
  "prepare_state_directory",
  "create_host_secret",
  "read_host_secret",
  "verify_internal_auth",
  "validate_request",
  "read_request_body",
  "rate_limit",
  "create_security_headers",
  "security_boundary",
] as const

export type SecurityOperation = (typeof SECURITY_OPERATIONS)[number]

export type SecurityDiagnostic = {
  readonly kind: "security_error"
  readonly code: SecurityErrorCode
  readonly operation: SecurityOperation
  readonly message: string
  readonly retryable: false
}

export type SecurityDecision<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SecurityDiagnostic }

const SAFE_MESSAGES = {
  state_path_unavailable: "A private user-local state path is unavailable.",
  state_permissions_invalid: "Local security state permissions are unsafe.",
  state_io_failed: "Local security state could not be accessed safely.",
  secret_invalid: "The local host secret is invalid.",
  auth_malformed: "Internal authentication data is malformed.",
  auth_expired: "The internal authentication challenge expired.",
  auth_invalid: "Internal authentication failed.",
  auth_replayed: "The internal authentication challenge was already used.",
  auth_capacity_exhausted: "Internal authentication capacity is exhausted.",
  request_transport_rejected: "The request did not cross the trusted proxy boundary.",
  request_identity_spoofed: "Untrusted identity headers were rejected.",
  request_host_rejected: "The request host is not trusted.",
  request_origin_rejected: "The browser origin is not trusted.",
  request_body_rejected: "The request body is invalid or too large.",
  request_rate_limited: "The request rate budget is exhausted.",
  configuration_invalid: "Security configuration is invalid.",
  internal_failure: "The security boundary failed closed.",
} satisfies Readonly<Record<SecurityErrorCode, string>>

export class SecurityError extends Error {
  override readonly name = "SecurityError"

  constructor(
    readonly code: SecurityErrorCode,
    readonly operation: SecurityOperation,
  ) {
    super(SAFE_MESSAGES[code])
  }

  toDiagnostic(): SecurityDiagnostic {
    return {
      kind: "security_error",
      code: this.code,
      operation: this.operation,
      message: SAFE_MESSAGES[this.code],
      retryable: false,
    }
  }
}

export function securityAllowed<T>(value: T): SecurityDecision<T> {
  return { ok: true, value }
}

export function securityDenied(
  code: SecurityErrorCode,
  operation: SecurityOperation,
): SecurityDecision<never> {
  return { ok: false, error: new SecurityError(code, operation).toDiagnostic() }
}

export function toSecurityDiagnostic(error: unknown): SecurityDiagnostic {
  if (error instanceof SecurityError) {
    return error.toDiagnostic()
  }
  return new SecurityError("internal_failure", "security_boundary").toDiagnostic()
}
