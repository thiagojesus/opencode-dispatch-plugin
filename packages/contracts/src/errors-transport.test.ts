import { describe, expect, test } from "bun:test"

import {
  CONTROL_CAPABILITY,
  DispatchError,
  ERROR_CATEGORIES,
  errorHttpStatus,
  PublicErrorEnvelopeSchema,
  TransportIdentitySchema,
  toPublicErrorEnvelope,
} from "./index.ts"

describe("transport identity contracts", () => {
  test("parses an identity only with the exact control capability", () => {
    const givenIdentity = {
      login: "operator@example.com",
      capability: CONTROL_CAPABILITY,
    }

    const parsedIdentity = TransportIdentitySchema.parse(givenIdentity)

    expect(String(parsedIdentity.login)).toBe(givenIdentity.login)
    expect(parsedIdentity.capability).toBe(givenIdentity.capability)
  })

  test("rejects an identity with a missing capability", () => {
    const givenIdentity = { login: "operator@example.com" }

    const parsedIdentity = TransportIdentitySchema.safeParse(givenIdentity)

    expect(parsedIdentity.success).toBe(false)
  })

  test("rejects an identity with an unrelated capability", () => {
    const givenIdentity = {
      login: "operator@example.com",
      capability: "opencode-dispatch-plugin/cap/read",
    }

    const parsedIdentity = TransportIdentitySchema.safeParse(givenIdentity)

    expect(parsedIdentity.success).toBe(false)
  })
})

describe("typed public errors", () => {
  test("serializes a typed error without exposing its raw cause", () => {
    const givenError = new DispatchError({
      category: "authorization",
      code: "CONTROL_NOT_AUTHORIZED",
      publicMessage: "The requested remote action is not authorized.",
      retryable: false,
      cause: new Error("private upstream token"),
    })

    const envelope = toPublicErrorEnvelope(givenError)

    expect(envelope.type).toBe("error")
    expect(envelope.version).toBe(1)
    expect(envelope.error.category).toBe("authorization")
    expect(String(envelope.error.code)).toBe("CONTROL_NOT_AUTHORIZED")
    expect(envelope.error.message).toBe("The requested remote action is not authorized.")
    expect(envelope.error.retryable).toBe(false)
    expect(JSON.stringify(envelope)).not.toContain("private upstream token")
  })

  test("redacts an untyped raw Error into a stable upstream envelope", () => {
    const givenError = new Error("provider token and stack must stay private")

    const envelope = toPublicErrorEnvelope(givenError)

    expect(envelope.error.category).toBe("upstream")
    expect(String(envelope.error.code)).toBe("UPSTREAM_FAILURE")
    expect(envelope.error.message).toBe(
      "The local OpenCode process could not complete the request.",
    )
    expect(envelope.error.retryable).toBe(true)
    expect(JSON.stringify(envelope)).not.toContain("provider token")
  })

  test("maps every typed error category to a stable HTTP status", () => {
    const expectedStatuses = [500, 503, 401, 403, 426, 410, 409, 409, 503, 429]

    const statuses = ERROR_CATEGORIES.map(errorHttpStatus)

    expect(statuses).toEqual(expectedStatuses)
  })

  test("rejects raw stack data in a public error envelope", () => {
    const givenEnvelope = {
      type: "error",
      version: 1,
      error: {
        category: "upstream",
        code: "UPSTREAM_FAILURE",
        message: "Request failed.",
        retryable: true,
        stack: "private stack",
      },
    }

    const parsedEnvelope = PublicErrorEnvelopeSchema.safeParse(givenEnvelope)

    expect(parsedEnvelope.success).toBe(false)
  })
})
