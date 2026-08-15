import { describe, expect, test } from "bun:test"

import { CONTROL_CAPABILITY, TailscaleLoginSchema } from "../../../../contracts/src/index.ts"

import { decodeTailscaleHeaderValue, parseTailscaleIdentity } from "./index.ts"

const EXPECTED_LOGIN = TailscaleLoginSchema.parse("operator@example.com")

describe("Tailscale Serve identity parsing", () => {
  test("accepts only the exact login and empty control capability parameters", () => {
    const headers = new Headers({
      "tailscale-app-capabilities": JSON.stringify({ [CONTROL_CAPABILITY]: [{}] }),
      "tailscale-user-login": "operator@example.com",
    })

    const identity = parseTailscaleIdentity(headers, EXPECTED_LOGIN)

    expect(identity).toMatchObject({
      ok: true,
      value: { capability: CONTROL_CAPABILITY },
    })
    expect(identity.ok ? String(identity.value.login) : undefined).toBe("operator@example.com")
  })

  test("decodes RFC2047 Q-encoded UTF-8 identity and capability headers", () => {
    const headers = new Headers({
      "tailscale-app-capabilities":
        "=?utf-8?q?=7B=22opencode-dispatch-plugin/cap/control=22=3A=5B=7B=7D=5D=7D?=",
      "tailscale-user-login": "=?utf-8?q?operator=40example.com?=",
    })

    const identity = parseTailscaleIdentity(headers, EXPECTED_LOGIN)

    expect(identity).toMatchObject({ ok: true })
  })

  test("rejects malformed RFC2047 identity rather than treating it as plain text", () => {
    const headers = new Headers({
      "tailscale-app-capabilities": JSON.stringify({ [CONTROL_CAPABILITY]: [{}] }),
      "tailscale-user-login": "=?utf-8?q?operator=4@example.com?=",
    })

    const identity = parseTailscaleIdentity(headers, EXPECTED_LOGIN)

    expect(identity).toMatchObject({
      ok: false,
      error: { code: "identity_malformed", httpStatus: 401 },
    })
  })

  test("rejects a missing capability header", () => {
    const headers = new Headers({ "tailscale-user-login": "operator@example.com" })

    const identity = parseTailscaleIdentity(headers, EXPECTED_LOGIN)

    expect(identity).toMatchObject({
      ok: false,
      error: { code: "capability_missing", httpStatus: 403 },
    })
  })

  test("rejects a control capability with parameters", () => {
    const headers = new Headers({
      "tailscale-app-capabilities": JSON.stringify({
        [CONTROL_CAPABILITY]: [{ role: "admin" }],
      }),
      "tailscale-user-login": "operator@example.com",
    })

    const identity = parseTailscaleIdentity(headers, EXPECTED_LOGIN)

    expect(identity).toMatchObject({
      ok: false,
      error: { code: "capability_denied", httpStatus: 403 },
    })
  })

  test("rejects a different or revoked login", () => {
    const headers = new Headers({
      "tailscale-app-capabilities": JSON.stringify({ [CONTROL_CAPABILITY]: [{}] }),
      "tailscale-user-login": "former-operator@example.com",
    })

    const identity = parseTailscaleIdentity(headers, EXPECTED_LOGIN)

    expect(identity).toMatchObject({
      ok: false,
      error: { code: "identity_mismatch", httpStatus: 401 },
    })
  })

  test("rejects invalid UTF-8 in an encoded header", () => {
    const decoded = decodeTailscaleHeaderValue("=?utf-8?q?=FF?=")

    expect(decoded).toBeUndefined()
  })
})
