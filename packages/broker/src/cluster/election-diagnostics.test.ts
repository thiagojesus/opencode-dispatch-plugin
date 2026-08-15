import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { DispatchConfigSchema } from "@opencode-dispatch/contracts"

import { startClusterMember } from "./index.ts"
import { BROKER_ORIGIN, TEST_CONFIG, temporaryStatePaths } from "./runtime.test-support.ts"

const foreignResponses = [
  ["invalid JSON", () => new Response("foreign-listener")],
  ["non-OK status", () => Response.json({ error: "foreign" }, { status: 503 })],
  ["schema mismatch", () => Response.json({ service: "foreign" })],
] as const

describe("broker health diagnostics", () => {
  test.each(foreignResponses)("maps received HTTP %s to foreign_listener", async (_, response) => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-diagnostic-"))
    const foreign = Bun.serve({ hostname: "127.0.0.1", port: 43_110, fetch: response })

    try {
      await expect(
        startClusterMember({
          config: TEST_CONFIG,
          serverUrl: "http://127.0.0.1:41901",
          statePaths: temporaryStatePaths(fixtureDirectory),
        }),
      ).rejects.toMatchObject({ code: "foreign_listener" })
      await expect(fetch(BROKER_ORIGIN).then((result) => result.status)).resolves.toBe(
        response().status,
      )
    } finally {
      await foreign.stop(true)
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("retries a transport connection failure as internal_failure", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-diagnostic-"))
    let connectionCount = 0
    const foreign = createServer((socket) => {
      connectionCount += 1
      socket.destroy()
    })
    await new Promise<void>((resolve) => foreign.listen(43_110, "127.0.0.1", resolve))
    const config = DispatchConfigSchema.parse({
      registration: { heartbeatIntervalMs: 50, ttlMs: 200 },
      reconnect: { initialDelayMs: 1, maxDelayMs: 1, maxAttempts: 3 },
    })

    try {
      await expect(
        startClusterMember({
          config,
          serverUrl: "http://127.0.0.1:41902",
          statePaths: temporaryStatePaths(fixtureDirectory),
        }),
      ).rejects.toMatchObject({ code: "reconnect_exhausted" })
      expect(connectionCount).toBe(config.reconnect.maxAttempts)
    } finally {
      await new Promise<void>((resolve, reject) =>
        foreign.close((error) => (error === undefined ? resolve() : reject(error))),
      )
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })
})
