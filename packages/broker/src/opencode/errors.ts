export const OPEN_CODE_ERROR_CODES = [
  "server_url_invalid",
  "authorization_invalid",
  "ownership_missing",
  "ownership_ambiguous",
  "process_unavailable",
  "response_invalid",
  "upstream_unauthorized",
  "upstream_not_found",
  "upstream_failure",
] as const

export type OpenCodeErrorCode = (typeof OPEN_CODE_ERROR_CODES)[number]

const ERROR_MESSAGES = {
  server_url_invalid: "The OpenCode server URL is not an HTTP(S) loopback target.",
  authorization_invalid: "The OpenCode server authorization is invalid.",
  ownership_missing: "No live OpenCode process owns this session.",
  ownership_ambiguous: "More than one live OpenCode process may own this session.",
  process_unavailable: "The owning OpenCode process is unavailable.",
  response_invalid: "The OpenCode process returned an invalid response.",
  upstream_unauthorized: "The OpenCode process rejected its internal authorization.",
  upstream_not_found: "The OpenCode process no longer has this session resource.",
  upstream_failure: "The OpenCode process could not complete the request.",
} as const satisfies Record<OpenCodeErrorCode, string>

export class OpenCodeAdapterError extends Error {
  override readonly name = "OpenCodeAdapterError"

  constructor(readonly code: OpenCodeErrorCode) {
    super(ERROR_MESSAGES[code])
  }
}

export function upstreamErrorForStatus(status: number): OpenCodeAdapterError {
  if (status === 401) {
    return new OpenCodeAdapterError("upstream_unauthorized")
  }
  if (status === 404) {
    return new OpenCodeAdapterError("upstream_not_found")
  }
  return new OpenCodeAdapterError("upstream_failure")
}
