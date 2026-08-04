import { describe, expect, test } from "bun:test"
import {
  createSecurityHeaders,
  createTrustedBrowserEndpoint,
  FixedWindowRateLimiter,
  readBodyWithinLimit,
  SecurityError,
  verifyRemoteRequest,
} from "./index.ts"

describe("security request policy", () => {
  test("accepts exact Host and Origin only through the trusted proxy boundary", () => {
    const endpoint = createTrustedBrowserEndpoint("https://workstation.example.ts.net")
    const headers = new Headers({
      host: "workstation.example.ts.net",
      origin: "https://workstation.example.ts.net",
    })

    const decision = verifyRemoteRequest(endpoint, {
      headers,
      ingress: "trusted_proxy",
      requiresOrigin: true,
    })

    expect(decision).toEqual({ ok: true, value: { kind: "trusted_request" } })
  })

  test("rejects spoofed Tailscale headers on a direct request", () => {
    const endpoint = createTrustedBrowserEndpoint("https://workstation.example.ts.net")
    const headers = new Headers({
      host: "workstation.example.ts.net",
      origin: "https://workstation.example.ts.net",
      "tailscale-app-capabilities": '{"control":[]}',
      "tailscale-user-login": "attacker@example.com",
    })

    const decision = verifyRemoteRequest(endpoint, {
      headers,
      ingress: "direct",
      requiresOrigin: true,
    })

    expect(decision).toMatchObject({
      ok: false,
      error: { code: "request_identity_spoofed", operation: "validate_request" },
    })
  })

  test("rejects a mismatched Host before any remote action", () => {
    const endpoint = createTrustedBrowserEndpoint("https://workstation.example.ts.net")
    const headers = new Headers({
      host: "attacker.example.ts.net",
      origin: "https://workstation.example.ts.net",
    })

    const decision = verifyRemoteRequest(endpoint, {
      headers,
      ingress: "trusted_proxy",
      requiresOrigin: true,
    })

    expect(decision).toMatchObject({ ok: false, error: { code: "request_host_rejected" } })
  })

  test("rejects a mismatched browser Origin for a remote action", () => {
    const endpoint = createTrustedBrowserEndpoint("https://workstation.example.ts.net")
    const headers = new Headers({
      host: "workstation.example.ts.net",
      origin: "https://malicious.example",
    })

    const decision = verifyRemoteRequest(endpoint, {
      headers,
      ingress: "trusted_proxy",
      requiresOrigin: true,
    })

    expect(decision).toMatchObject({ ok: false, error: { code: "request_origin_rejected" } })
  })

  test("rejects non-HTTPS and credential-bearing browser endpoints", () => {
    const insecureEndpoint = () => createTrustedBrowserEndpoint("http://workstation.example.ts.net")
    const credentialEndpoint = () =>
      createTrustedBrowserEndpoint("https://user:password@workstation.example.ts.net")

    expect(insecureEndpoint).toThrow(SecurityError)
    expect(credentialEndpoint).toThrow(SecurityError)
  })

  test("stops reading a body as soon as the configured byte limit is exceeded", async () => {
    const request = new Request("https://workstation.example.ts.net/api/v1/action", {
      body: new Uint8Array(9),
      method: "POST",
    })

    const decision = await readBodyWithinLimit(request, 8)

    expect(decision).toMatchObject({ ok: false, error: { code: "request_body_rejected" } })
  })

  test("fails closed after the per-subject rate budget is exhausted", () => {
    const limiter = new FixedWindowRateLimiter({
      limit: 2,
      maxSubjects: 4,
      now: () => 1_000_000,
      windowMs: 60_000,
    })
    limiter.consume("alice@example.com/session-a")
    limiter.consume("alice@example.com/session-a")

    const decision = limiter.consume("alice@example.com/session-a")

    expect(decision).toMatchObject({
      ok: false,
      error: { code: "request_rate_limited", operation: "rate_limit" },
    })
  })

  test("fails closed when the rate-limit clock is invalid", () => {
    const limiter = new FixedWindowRateLimiter({
      limit: 2,
      maxSubjects: 4,
      now: () => -1,
      windowMs: 60_000,
    })

    const decision = limiter.consume("alice@example.com/session-a")

    expect(decision).toMatchObject({
      ok: false,
      error: { code: "configuration_invalid", operation: "rate_limit" },
    })
  })

  test("emits strict document CSP and no-store API headers", () => {
    const documentHeaders = createSecurityHeaders("document")
    const apiHeaders = createSecurityHeaders("api")

    expect(documentHeaders.get("content-security-policy")).toContain("default-src 'self'")
    expect(documentHeaders.get("content-security-policy")).toContain("frame-ancestors 'none'")
    expect(documentHeaders.get("x-content-type-options")).toBe("nosniff")
    expect(apiHeaders.get("cache-control")).toBe("no-store")
  })
})
