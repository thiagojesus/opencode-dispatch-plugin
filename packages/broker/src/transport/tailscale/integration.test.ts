import { expect, test } from "bun:test"
import { startTrustedProxyFixture } from "../../../../../tests/fixtures/trusted-proxy.ts"
import { CONTROL_CAPABILITY, TailscaleLoginSchema } from "../../../../contracts/src/index.ts"

import { createTailscaleTransportGuard, type TailscaleReadySetup } from "./index.ts"

const STABLE_HOST = "workstation.example.ts.net"
const STABLE_ORIGIN = `https://${STABLE_HOST}`

test("trusted proxy strips spoofed headers and authorizes API traffic exactly once", async () => {
  const setup = {
    kind: "ready",
    allowedLogin: TailscaleLoginSchema.parse("fixture-user@example.test"),
    grantVerification: "per_request",
    machineName: "workstation",
    stableUrl: STABLE_ORIGIN,
  } satisfies TailscaleReadySetup
  let upstreamCalls = 0
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const guard = createTailscaleTransportGuard({
        backendOrigin: backend.url.origin,
        setup,
      })
      const decision = guard({
        headers: request.headers,
        ingress: "trusted_proxy",
        requiresOrigin: true,
      })
      if (!decision.ok) {
        return Response.json(decision.error, { status: decision.error.httpStatus })
      }
      upstreamCalls += 1
      return new Response(null, { status: 204 })
    },
  })
  const proxy = await startTrustedProxyFixture({
    forwardedHost: STABLE_HOST,
    identity: { login: "fixture-user@example.test", name: "Fixture User" },
    targetOrigin: backend.url.origin,
  })

  try {
    const response = await fetch(new URL("/api/v1/health", proxy.origin), {
      headers: {
        host: "attacker.example.ts.net",
        origin: STABLE_ORIGIN,
        "tailscale-app-capabilities": JSON.stringify({ attacker: [{}] }),
        "tailscale-user-login": "attacker@example.test",
      },
    })

    expect(response.status).toBe(204)
    expect(upstreamCalls).toBe(1)
    expect(proxy.requests()[0]?.headers.get("tailscale-user-login")).toBe(
      "fixture-user@example.test",
    )
    expect(proxy.requests()[0]?.headers.get("tailscale-app-capabilities")).toBe(
      JSON.stringify({ [CONTROL_CAPABILITY]: [{}] }),
    )
  } finally {
    await Promise.all([proxy.stop(), backend.stop(true)])
  }
})

test("wrong-origin proxy traffic is denied before an upstream action", async () => {
  const setup = {
    kind: "ready",
    allowedLogin: TailscaleLoginSchema.parse("fixture-user@example.test"),
    grantVerification: "per_request",
    machineName: "workstation",
    stableUrl: STABLE_ORIGIN,
  } satisfies TailscaleReadySetup
  let upstreamCalls = 0
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const guard = createTailscaleTransportGuard({
        backendOrigin: backend.url.origin,
        setup,
      })
      const decision = guard({
        headers: request.headers,
        ingress: "trusted_proxy",
        requiresOrigin: true,
      })
      if (!decision.ok) {
        return Response.json(decision.error, { status: decision.error.httpStatus })
      }
      upstreamCalls += 1
      return new Response(null, { status: 204 })
    },
  })
  const proxy = await startTrustedProxyFixture({
    forwardedHost: STABLE_HOST,
    identity: { login: "fixture-user@example.test", name: "Fixture User" },
    targetOrigin: backend.url.origin,
  })

  try {
    const response = await fetch(new URL("/api/v1/health", proxy.origin), {
      headers: { origin: "https://malicious.example" },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: "origin_rejected" })
    expect(upstreamCalls).toBe(0)
  } finally {
    await Promise.all([proxy.stop(), backend.stop(true)])
  }
})
