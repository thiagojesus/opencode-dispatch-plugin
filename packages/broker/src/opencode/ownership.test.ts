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

test("preserves live ownership chronology when an older claim replays later", async () => {
  expect(await implementation.exists()).toBe(true)
  const { createOpenCodeStatusSeed, OpenCodeAdapter } = await import("./index.ts")
  const olderNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000101")
  const newerNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000102")
  const adapter = new OpenCodeAdapter()

  adapter.registerProcess({ processNonce: olderNonce, serverUrl: "http://127.0.0.1:41001" })
  adapter.registerProcess({ processNonce: newerNonce, serverUrl: "http://127.0.0.1:41002" })
  adapter.observe(newerNonce, {
    ...createOpenCodeStatusSeed("ses-replay-order", 5_002),
    source: "live",
  })

  adapter.observe(olderNonce, {
    ...createOpenCodeStatusSeed("ses-replay-order", 5_001),
    source: "live",
  })

  expect(adapter.resolveOwner("ses-replay-order")).toBe(newerNonce)
})

test("fails closed when two live claims have equal chronology", async () => {
  expect(await implementation.exists()).toBe(true)
  const { createOpenCodeStatusSeed, OpenCodeAdapter } = await import("./index.ts")
  const firstNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000103")
  const secondNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000104")
  const adapter = new OpenCodeAdapter()

  adapter.registerProcess({ processNonce: firstNonce, serverUrl: "http://127.0.0.1:41003" })
  adapter.registerProcess({ processNonce: secondNonce, serverUrl: "http://127.0.0.1:41004" })
  adapter.observe(firstNonce, {
    ...createOpenCodeStatusSeed("ses-equal-chronology", 6_000),
    source: "live",
  })
  adapter.observe(secondNonce, {
    ...createOpenCodeStatusSeed("ses-equal-chronology", 6_000),
    source: "live",
  })

  expect(() => adapter.resolveOwner("ses-equal-chronology")).toThrow(
    expect.objectContaining({ code: "ownership_ambiguous" }),
  )
})

test("rejects a live claim with missing chronology without installing ownership", async () => {
  expect(await implementation.exists()).toBe(true)
  const { OpenCodeAdapter } = await import("./index.ts")
  const processNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000105")
  const adapter = new OpenCodeAdapter()
  adapter.registerProcess({ processNonce, serverUrl: "http://127.0.0.1:41005" })

  expect(() =>
    adapter.observe(processNonce, {
      eventType: "session.idle",
      sessionId: "ses-missing-chronology",
      source: "live",
    }),
  ).toThrow()
  expect(() => adapter.resolveOwner("ses-missing-chronology")).toThrow(
    expect.objectContaining({ code: "ownership_missing" }),
  )
})
