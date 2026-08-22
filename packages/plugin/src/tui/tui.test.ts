import { expect, test } from "bun:test"

const targetImplementation = Bun.file(new URL("./index.ts", import.meta.url))

test("exports a target-exclusive TUI module", async () => {
  expect(await targetImplementation.exists()).toBe(true)
  const module = await import("./index.ts")

  expect(Object.keys(module)).toEqual(["default"])
  expect(Object.keys(module.default).sort()).toEqual(["id", "tui"])
  expect(module.default.id).toBe("opencode-dispatch-plugin")
  expect(typeof module.default.tui).toBe("function")
})

test("keeps the server target exclusive", async () => {
  const serverTarget = await import("../server/index.ts")

  expect(Object.keys(serverTarget).sort()).toEqual(["id", "server"])
})
