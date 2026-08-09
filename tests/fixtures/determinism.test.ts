import { expect, test } from "bun:test"

const implementation = Bun.file(new URL("./determinism.ts", import.meta.url))

test("advances a deterministic clock only when instructed", async () => {
  expect(await implementation.exists()).toBe(true)
  const { DeterministicClock } = await import("./determinism.ts")
  const clock = new DeterministicClock(1_700_000_000_000)

  const before = clock.now()
  clock.advance(250)
  const after = clock.now()

  expect(Number(before)).toBe(1_700_000_000_000)
  expect(Number(after)).toBe(1_700_000_000_250)
})

test("generates stable typed identifiers from an isolated sequence", async () => {
  expect(await implementation.exists()).toBe(true)
  const { DeterministicIds } = await import("./determinism.ts")
  const first = new DeterministicIds(7)
  const second = new DeterministicIds(7)

  const firstRun = [first.session(), first.message(), first.permission(), first.question()]
  const secondRun = [second.session(), second.message(), second.permission(), second.question()]

  expect(firstRun).toEqual(secondRun)
  expect(new Set(firstRun).size).toBe(4)
})
