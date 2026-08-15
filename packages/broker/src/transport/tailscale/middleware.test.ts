import { describe, expect, test } from "bun:test"

import { CONTROL_CAPABILITY, TailscaleLoginSchema } from "../../../../contracts/src/index.ts"

import {
  createTailscaleTransportGuard,
  type TailscaleReadySetup,
  TailscaleTransportConfigurationError,
} from "./index.ts"

const READY_SETUP = {
  kind: "ready",
  allowedLogin: TailscaleLoginSchema.parse("operator@example.com"),
  grantVerification: "per_request",
  machineName: "workstation",
  stableUrl: "https://workstation.example.ts.net",
} satisfies TailscaleReadySetup

function exactHeaders(): Headers {
  return new Headers({
    host: "workstation.example.ts.net",
    origin: "https://workstation.example.ts.net",
    "tailscale-app-capabilities": JSON.stringify({ [CONTROL_CAPABILITY]: [{}] }),
    "tailscale-user-login": "operator@example.com",
  })
}

describe("Tailscale transport guard", () => {
  test("authorizes an exact Serve request to a loopback backend", () => {
    const guard = createTailscaleTransportGuard({
      backendOrigin: "http://127.0.0.1:43110",
      setup: READY_SETUP,
    })

    const decision = guard({
      headers: exactHeaders(),
      ingress: "trusted_proxy",
      requiresOrigin: true,
    })

    expect(decision).toMatchObject({ ok: true })
  })

  test("rejects the wrong Host", () => {
    const guard = createTailscaleTransportGuard({
      backendOrigin: "http://127.0.0.1:43110",
      setup: READY_SETUP,
    })
    const headers = exactHeaders()
    headers.set("host", "attacker.example.ts.net")

    const decision = guard({ headers, ingress: "trusted_proxy", requiresOrigin: true })

    expect(decision).toMatchObject({
      ok: false,
      error: { code: "host_rejected", httpStatus: 403 },
    })
  })

  test("rejects the wrong browser Origin", () => {
    const guard = createTailscaleTransportGuard({
      backendOrigin: "http://127.0.0.1:43110",
      setup: READY_SETUP,
    })
    const headers = exactHeaders()
    headers.set("origin", "https://malicious.example")

    const decision = guard({ headers, ingress: "trusted_proxy", requiresOrigin: true })

    expect(decision).toMatchObject({
      ok: false,
      error: { code: "origin_rejected", httpStatus: 403 },
    })
  })

  test("rejects spoofed Serve headers on a direct localhost request", () => {
    const guard = createTailscaleTransportGuard({
      backendOrigin: "http://127.0.0.1:43110",
      setup: READY_SETUP,
    })
    const headers = exactHeaders()
    headers.set("authorization", "Bearer forged-jwt")

    const decision = guard({ headers, ingress: "direct", requiresOrigin: true })

    expect(decision).toMatchObject({
      ok: false,
      error: { code: "identity_spoofed", httpStatus: 401 },
    })
  })

  test("does not use Basic authentication as a direct-browser fallback", () => {
    const guard = createTailscaleTransportGuard({
      backendOrigin: "http://127.0.0.1:43110",
      setup: READY_SETUP,
    })
    const headers = new Headers({ authorization: "Basic Zm9vOmJhcg==" })

    const decision = guard({ headers, ingress: "direct", requiresOrigin: true })

    expect(decision).toMatchObject({
      ok: false,
      error: { code: "transport_rejected", httpStatus: 401 },
    })
  })

  test("applies the same exact Origin rule to a WebSocket handshake", () => {
    const guard = createTailscaleTransportGuard({
      backendOrigin: "http://127.0.0.1:43110",
      setup: READY_SETUP,
    })
    const headers = exactHeaders()
    headers.set("origin", "https://malicious.example")
    headers.set("sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ==")
    headers.set("sec-websocket-version", "13")

    const decision = guard({ headers, ingress: "trusted_proxy", requiresOrigin: true })

    expect(decision).toMatchObject({
      ok: false,
      error: { code: "origin_rejected", httpStatus: 403 },
    })
  })

  test("rejects a non-loopback broker configuration", () => {
    const createGuard = () =>
      createTailscaleTransportGuard({
        backendOrigin: "http://0.0.0.0:43110",
        setup: READY_SETUP,
      })

    expect(createGuard).toThrow(TailscaleTransportConfigurationError)
  })
})
