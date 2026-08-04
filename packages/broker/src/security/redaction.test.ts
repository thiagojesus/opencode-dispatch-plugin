import { describe, expect, test } from "bun:test"
import { redactStructured, toSecurityDiagnostic } from "./index.ts"

describe("security redaction", () => {
  test("removes credentials, capability headers, prompts, paths, and raw stacks", () => {
    const leakedError = new Error("token=TOKEN_SENTINEL\r\nforged=true")
    leakedError.stack = "STACK_SENTINEL at /Users/alice/Projects/private/source.ts:1:1"
    const untrusted = {
      Authorization: "Bearer BEARER_SENTINEL",
      "Tailscale-App-Capabilities": '{"control":"CAPABILITY_SENTINEL"}',
      prompt: "PROMPT_SENTINEL",
      projectPath: "/Users/alice/Projects/private",
      nested: {
        cookie: "COOKIE_SENTINEL",
        error: leakedError,
      },
    }

    const redacted = redactStructured(untrusted)
    const serialized = JSON.stringify(redacted)

    expect(redacted).toEqual({
      Authorization: "[REDACTED]",
      "Tailscale-App-Capabilities": "[REDACTED]",
      prompt: "[REDACTED]",
      projectPath: "[REDACTED]",
      nested: {
        cookie: "[REDACTED]",
        error: {
          message: "[REDACTED]",
          name: "Error",
          stack: "[REDACTED]",
        },
      },
    })
    for (const forbidden of [
      "BEARER_SENTINEL",
      "CAPABILITY_SENTINEL",
      "PROMPT_SENTINEL",
      "COOKIE_SENTINEL",
      "TOKEN_SENTINEL",
      "STACK_SENTINEL",
      "/Users/alice/Projects/private",
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  test("returns a typed generic diagnostic for an unknown injected error", () => {
    const error = new Error(
      "Bearer TOKEN_SENTINEL\r\n/Users/alice/Projects/private should not escape",
    )

    const diagnostic = toSecurityDiagnostic(error)
    const serialized = JSON.stringify(diagnostic)

    expect(diagnostic).toMatchObject({
      kind: "security_error",
      code: "internal_failure",
      operation: "security_boundary",
      retryable: false,
    })
    expect(serialized).not.toContain("TOKEN_SENTINEL")
    expect(serialized).not.toContain("/Users/alice")
    expect(serialized).not.toContain("\r")
    expect(serialized).not.toContain("\n")
  })
})
