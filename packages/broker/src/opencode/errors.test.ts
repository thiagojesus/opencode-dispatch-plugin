import { expect, test } from "bun:test"

import { ProcessInstanceNonceSchema } from "@opencode-dispatch/contracts"

const implementation = Bun.file(new URL("./index.ts", import.meta.url))

test("rejects a non-loopback target before constructing an SDK client", async () => {
  expect(await implementation.exists()).toBe(true)
  const { OpenCodeAdapter } = await import("./index.ts")
  const adapter = new OpenCodeAdapter()

  expect(() =>
    adapter.registerProcess({
      processNonce: ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000076"),
      serverUrl: "https://example.com",
    }),
  ).toThrow(expect.objectContaining({ code: "server_url_invalid" }))
})

test("maps upstream authorization, not-found, and server failures without secret text", async () => {
  expect(await implementation.exists()).toBe(true)
  const { OpenCodeAdapter } = await import("./index.ts")
  const { startOpenCodeFixture } = await import("../../../../tests/fixtures/open-code.ts")
  const secret = "Basic Zml4dHVyZS11c2VyOnNlbnRpbmVsLXNlY3JldA=="
  const processNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000077")
  const unauthorized = await startOpenCodeFixture({
    compatibility: "1.18.3",
    authorization: secret,
  })
  const missing = await startOpenCodeFixture({
    compatibility: "1.18.3",
    failure: { operation: "session", status: 404 },
  })
  const failed = await startOpenCodeFixture({
    compatibility: "latest-compatible",
    failure: { operation: "session", status: 500 },
  })

  try {
    const unauthorizedAdapter = new OpenCodeAdapter()
    unauthorizedAdapter.registerProcess({ processNonce, serverUrl: unauthorized.origin })
    await expect(unauthorizedAdapter.seedStatuses(processNonce, 4_000)).rejects.toMatchObject({
      code: "upstream_unauthorized",
    })
    await expect(unauthorizedAdapter.seedStatuses(processNonce, 4_001)).rejects.not.toThrow(secret)

    for (const [fixture, code] of [
      [missing, "upstream_not_found"],
      [failed, "upstream_failure"],
    ] as const) {
      const adapter = new OpenCodeAdapter()
      adapter.registerProcess({ processNonce, serverUrl: fixture.origin })
      await adapter.seedStatuses(processNonce, 4_002)
      await expect(adapter.get(fixture.scenario.sessionId)).rejects.toMatchObject({ code })
      adapter.dispose()
    }
  } finally {
    await Promise.all([unauthorized.stop(), missing.stop(), failed.stop()])
  }
})
