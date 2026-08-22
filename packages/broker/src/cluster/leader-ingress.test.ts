import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { CONTROL_CAPABILITY, PublicErrorEnvelopeSchema } from "@opencode-dispatch/contracts"

import {
  BROKER_ORIGIN,
  clusterModule,
  TEST_CONFIG,
  temporaryStatePaths,
} from "./runtime.test-support.ts"

const TRUSTED_HEADERS = {
  host: "workstation.example.ts.net",
  origin: "https://workstation.example.ts.net",
  "tailscale-app-capabilities": JSON.stringify({ [CONTROL_CAPABILITY]: [{}] }),
  "tailscale-user-login": "owner@example.com",
  "tailscale-user-name": "Owner",
} as const

describe("leader ingress boundaries", () => {
  test("rejects forged Tailscale identity headers on the direct broker listener", async () => {
    const { startClusterMember } = await clusterModule()
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-ingress-"))
    const member = await startClusterMember({
      config: TEST_CONFIG,
      serverUrl: "http://127.0.0.1:41005",
      statePaths: temporaryStatePaths(fixtureDirectory),
    })

    try {
      const response = await fetch(`${BROKER_ORIGIN}/api/v1/health`, {
        headers: TRUSTED_HEADERS,
      })
      const error = PublicErrorEnvelopeSchema.parse(await response.json())

      expect(response.status).toBe(401)
      expect(String(error.error.code)).toBe("IDENTITY_SPOOFED")
    } finally {
      await member.dispose()
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("accepts Tailscale identity only on the dedicated Serve listener", async () => {
    const { startClusterMember } = await clusterModule()
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-ingress-"))
    const member = await startClusterMember({
      config: TEST_CONFIG,
      serverUrl: "http://127.0.0.1:41006",
      statePaths: temporaryStatePaths(fixtureDirectory),
    })

    try {
      const response = await fetch("http://127.0.0.1:43111/api/v1/health", {
        headers: TRUSTED_HEADERS,
      })
      const error = PublicErrorEnvelopeSchema.parse(await response.json())

      expect(response.status).toBe(503)
      expect(String(error.error.code)).toBe("TAILSCALE_UNAVAILABLE")
    } finally {
      await member.dispose()
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })
})
