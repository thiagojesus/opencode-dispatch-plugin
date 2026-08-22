import {
  type ErrorCategory,
  ErrorCodeSchema,
  PublicErrorEnvelopeSchema,
} from "@opencode-dispatch/contracts"

import { OpenCodeAdapterError } from "../opencode/index.ts"
import { createSecurityHeaders } from "../security/index.ts"
import type { TailscaleTransportDenial } from "../transport/tailscale/index.ts"

type ApiErrorDefinition = {
  readonly category: ErrorCategory
  readonly message: string
  readonly retryable: boolean
  readonly status: number
}

const API_ERRORS = {
  BODY_TOO_LARGE: {
    category: "conflict",
    message: "The request body is too large.",
    retryable: false,
    status: 413,
  },
  CAPABILITY_DENIED: {
    category: "authorization",
    message: "The required control capability is not granted.",
    retryable: false,
    status: 403,
  },
  CAPABILITY_MALFORMED: {
    category: "authorization",
    message: "The control capability is malformed.",
    retryable: false,
    status: 403,
  },
  CAPABILITY_MISSING: {
    category: "authorization",
    message: "The required control capability is missing.",
    retryable: false,
    status: 403,
  },
  CONTENT_TYPE_REQUIRED: {
    category: "compatibility",
    message: "A JSON content type is required.",
    retryable: false,
    status: 415,
  },
  HOST_REJECTED: {
    category: "authorization",
    message: "The request host is not authorized.",
    retryable: false,
    status: 403,
  },
  IDENTITY_MALFORMED: {
    category: "identity",
    message: "The Tailscale identity is malformed.",
    retryable: false,
    status: 401,
  },
  IDENTITY_MISMATCH: {
    category: "identity",
    message: "The Tailscale identity is not authorized.",
    retryable: false,
    status: 401,
  },
  IDENTITY_MISSING: {
    category: "identity",
    message: "The Tailscale identity is missing.",
    retryable: false,
    status: 401,
  },
  IDENTITY_SPOOFED: {
    category: "identity",
    message: "Direct identity headers are not trusted.",
    retryable: false,
    status: 401,
  },
  METHOD_NOT_ALLOWED: {
    category: "compatibility",
    message: "The request method is not allowed.",
    retryable: false,
    status: 405,
  },
  ORIGIN_REJECTED: {
    category: "authorization",
    message: "The request origin is not authorized.",
    retryable: false,
    status: 403,
  },
  OWNERSHIP_AMBIGUOUS: {
    category: "conflict",
    message: "The session owner is ambiguous.",
    retryable: true,
    status: 409,
  },
  OWNERSHIP_CONFLICT: {
    category: "conflict",
    message: "The session exposure conflicts with its live owner.",
    retryable: true,
    status: 409,
  },
  PENDING_ACTION_STALE: {
    category: "stale",
    message: "The pending action is no longer current.",
    retryable: false,
    status: 409,
  },
  RATE_LIMITED: {
    category: "rate_limit",
    message: "The request rate limit was reached.",
    retryable: true,
    status: 429,
  },
  REQUEST_INVALID: {
    category: "compatibility",
    message: "The request does not match the v1 contract.",
    retryable: false,
    status: 400,
  },
  ROUTE_NOT_FOUND: {
    category: "compatibility",
    message: "The API route does not exist.",
    retryable: false,
    status: 404,
  },
  SESSION_GONE: {
    category: "ownership",
    message: "The enabled session is no longer available.",
    retryable: false,
    status: 410,
  },
  TAILSCALE_UNAVAILABLE: {
    category: "transport",
    message: "The private transport is not ready.",
    retryable: true,
    status: 503,
  },
  TRANSPORT_REJECTED: {
    category: "identity",
    message: "The request did not arrive through the private transport.",
    retryable: false,
    status: 401,
  },
  UPSTREAM_UNAVAILABLE: {
    category: "upstream",
    message: "The owning OpenCode process is unavailable.",
    retryable: true,
    status: 503,
  },
} as const satisfies Readonly<Record<string, ApiErrorDefinition>>

export type ApiErrorCode = keyof typeof API_ERRORS

export class ApiHttpError extends Error {
  override readonly name = "ApiHttpError"

  constructor(readonly code: ApiErrorCode) {
    super(API_ERRORS[code].message)
  }
}

export function apiErrorResponse(error: ApiHttpError): Response {
  const definition = API_ERRORS[error.code]
  const body = PublicErrorEnvelopeSchema.parse({
    type: "error",
    version: 1,
    error: {
      category: definition.category,
      code: ErrorCodeSchema.parse(error.code),
      message: definition.message,
      retryable: definition.retryable,
    },
  })
  return Response.json(body, { status: definition.status, headers: createSecurityHeaders("api") })
}

export function apiErrorFrom(error: unknown): ApiHttpError {
  if (error instanceof ApiHttpError) return error
  if (error instanceof OpenCodeAdapterError) {
    switch (error.code) {
      case "ownership_missing":
      case "upstream_not_found":
        return new ApiHttpError("SESSION_GONE")
      case "ownership_ambiguous":
        return new ApiHttpError("OWNERSHIP_AMBIGUOUS")
      case "process_unavailable":
      case "response_invalid":
      case "upstream_failure":
      case "upstream_unauthorized":
      case "authorization_invalid":
      case "server_url_invalid":
        return new ApiHttpError("UPSTREAM_UNAVAILABLE")
    }
  }
  return new ApiHttpError("UPSTREAM_UNAVAILABLE")
}

export function transportErrorFrom(error: TailscaleTransportDenial): ApiHttpError {
  switch (error.code) {
    case "capability_denied":
      return new ApiHttpError("CAPABILITY_DENIED")
    case "capability_malformed":
      return new ApiHttpError("CAPABILITY_MALFORMED")
    case "capability_missing":
      return new ApiHttpError("CAPABILITY_MISSING")
    case "host_rejected":
      return new ApiHttpError("HOST_REJECTED")
    case "identity_malformed":
      return new ApiHttpError("IDENTITY_MALFORMED")
    case "identity_mismatch":
      return new ApiHttpError("IDENTITY_MISMATCH")
    case "identity_missing":
      return new ApiHttpError("IDENTITY_MISSING")
    case "identity_spoofed":
      return new ApiHttpError("IDENTITY_SPOOFED")
    case "origin_rejected":
      return new ApiHttpError("ORIGIN_REJECTED")
    case "transport_rejected":
      return new ApiHttpError("TRANSPORT_REJECTED")
  }
}
