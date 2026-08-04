import { z } from "zod"

import { MAX_SHORT_TEXT_LENGTH, PROTOCOL_VERSION } from "./constants.ts"
import { assertNever } from "./exhaustive.ts"

export const ERROR_CATEGORIES = [
  "configuration",
  "transport",
  "identity",
  "authorization",
  "compatibility",
  "ownership",
  "stale",
  "conflict",
  "upstream",
  "rate_limit",
] as const

export const ErrorCategorySchema = z.enum(ERROR_CATEGORIES)
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>

export const ErrorCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{2,63}$/u)
  .brand<"ErrorCode">()
export type ErrorCode = z.infer<typeof ErrorCodeSchema>

const PublicErrorSchema = z
  .strictObject({
    category: ErrorCategorySchema,
    code: ErrorCodeSchema,
    message: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH),
    retryable: z.boolean(),
  })
  .readonly()

export const PublicErrorEnvelopeSchema = z
  .strictObject({
    type: z.literal("error"),
    version: z.literal(PROTOCOL_VERSION),
    error: PublicErrorSchema,
  })
  .readonly()
export type PublicErrorEnvelope = z.infer<typeof PublicErrorEnvelopeSchema>

export type DispatchErrorOptions = {
  readonly category: ErrorCategory
  readonly code: string
  readonly publicMessage: string
  readonly retryable: boolean
  readonly cause?: unknown
}

export class DispatchError extends Error {
  override readonly name = "DispatchError"
  readonly category: ErrorCategory
  readonly code: ErrorCode
  readonly publicMessage: string
  readonly retryable: boolean

  constructor(options: DispatchErrorOptions) {
    const code = ErrorCodeSchema.parse(options.code)
    const publicMessage = z.string().min(1).max(MAX_SHORT_TEXT_LENGTH).parse(options.publicMessage)
    super(publicMessage, { cause: options.cause })
    this.category = options.category
    this.code = code
    this.publicMessage = publicMessage
    this.retryable = options.retryable
  }
}

export function toPublicErrorEnvelope(error: unknown): PublicErrorEnvelope {
  const publicError =
    error instanceof DispatchError
      ? {
          category: error.category,
          code: error.code,
          message: error.publicMessage,
          retryable: error.retryable,
        }
      : {
          category: "upstream",
          code: "UPSTREAM_FAILURE",
          message: "The local OpenCode process could not complete the request.",
          retryable: true,
        }

  return PublicErrorEnvelopeSchema.parse({
    type: "error",
    version: PROTOCOL_VERSION,
    error: publicError,
  })
}

export function errorHttpStatus(category: ErrorCategory): number {
  switch (category) {
    case "configuration":
      return 500
    case "transport":
      return 503
    case "identity":
      return 401
    case "authorization":
      return 403
    case "compatibility":
      return 426
    case "ownership":
      return 410
    case "stale":
      return 409
    case "conflict":
      return 409
    case "upstream":
      return 503
    case "rate_limit":
      return 429
    default:
      return assertNever(category)
  }
}
