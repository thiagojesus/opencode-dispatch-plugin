import { describe, expect, test } from "bun:test"
import { redactStructured, toSecurityDiagnostic } from "./index.ts"

function throwUnknown(value: unknown): never {
  throw value
}

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

  test.each([
    "/opt/ORG_SENTINEL/private.ts",
    "/workspace/ORG_SENTINEL/private.ts",
    "/mnt/ORG_SENTINEL/private.ts",
    "/srv/ORG_SENTINEL/private.ts",
    "/Volumes/ORG_SENTINEL/private.ts",
  ])("redacts arbitrary absolute POSIX path %s", (absolutePath) => {
    const serialized = JSON.stringify(
      redactStructured({ detail: `operation failed at ${absolutePath}` }),
    )

    expect(serialized).toContain("[PATH]")
    expect(serialized).not.toContain("ORG_SENTINEL")
    expect(serialized).not.toContain(absolutePath)
  })

  test("returns unavailable when an object boundary throws a non-Error value", () => {
    const untrusted = new Proxy(
      {},
      {
        ownKeys: () => throwUnknown("RAW_NON_ERROR_SENTINEL"),
      },
    )

    const redacted = redactStructured(untrusted)

    expect(redacted).toBe("[UNAVAILABLE]")
  })
})
