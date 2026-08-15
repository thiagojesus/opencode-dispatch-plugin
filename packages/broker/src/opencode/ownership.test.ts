import { expect, test } from "bun:test"

import { ProcessInstanceNonceSchema } from "@opencode-dispatch/contracts"

const implementation = Bun.file(new URL("./index.ts", import.meta.url))

test("fails closed for duplicate status seeds until one process emits a live event", async () => {
  expect(await implementation.exists()).toBe(true)
  const { createOpenCodeStatusSeed, OpenCodeAdapter } = await import("./index.ts")
  const { startOpenCodeFixture } = await import("../../../../tests/fixtures/open-code.ts")
  const first = await startOpenCodeFixture({ compatibility: "1.18.3" })
  const second = await startOpenCodeFixture({ compatibility: "latest-compatible" })
  const firstNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000072")
  const secondNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000073")
  const adapter = new OpenCodeAdapter()

  try {
    adapter.registerProcess({ processNonce: firstNonce, serverUrl: first.origin })
    adapter.registerProcess({ processNonce: secondNonce, serverUrl: second.origin })
    await adapter.seedStatuses(firstNonce, 2_000)
    await adapter.seedStatuses(secondNonce, 2_001)

    expect(() => adapter.resolveOwner(first.scenario.sessionId)).toThrow(
      expect.objectContaining({ code: "ownership_ambiguous" }),
    )

    adapter.observe(firstNonce, {
      ...createOpenCodeStatusSeed(first.scenario.sessionId, 2_002),
      source: "live",
    })
    await adapter.promptAsync(first.scenario.sessionId, "first owner")

    expect(first.requests()).toEqual([{ operation: "prompt_async", text: "first owner" }])
    expect(second.requests()).toEqual([])
  } finally {
    adapter.dispose()
    await Promise.all([first.stop(), second.stop()])
  }
})

test("does not fall back to an older claim after the current owner unregisters", async () => {
  expect(await implementation.exists()).toBe(true)
  const { createOpenCodeStatusSeed, OpenCodeAdapter } = await import("./index.ts")
  const { startOpenCodeFixture } = await import("../../../../tests/fixtures/open-code.ts")
  const first = await startOpenCodeFixture({ compatibility: "1.18.3" })
  const second = await startOpenCodeFixture({ compatibility: "latest-compatible" })
  const firstNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000074")
  const secondNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000075")
  const adapter = new OpenCodeAdapter()

  try {
    adapter.registerProcess({ processNonce: firstNonce, serverUrl: first.origin })
    adapter.registerProcess({ processNonce: secondNonce, serverUrl: second.origin })
    adapter.observe(firstNonce, {
      ...createOpenCodeStatusSeed(first.scenario.sessionId, 3_000),
      source: "live",
    })
    adapter.observe(secondNonce, {
      ...createOpenCodeStatusSeed(second.scenario.sessionId, 3_001),
      source: "live",
    })
    expect(adapter.resolveOwner(first.scenario.sessionId)).toBe(secondNonce)

    adapter.unregisterProcess(secondNonce)

    expect(() => adapter.resolveOwner(first.scenario.sessionId)).toThrow(
      expect.objectContaining({ code: "ownership_missing" }),
    )
    adapter.observe(firstNonce, {
      ...createOpenCodeStatusSeed(first.scenario.sessionId, 3_002),
      source: "live",
    })
    expect(adapter.resolveOwner(first.scenario.sessionId)).toBe(firstNonce)
  } finally {
    adapter.dispose()
    await Promise.all([first.stop(), second.stop()])
  }
})
