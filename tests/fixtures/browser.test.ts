import { expect, test } from "bun:test"

const implementation = Bun.file(new URL("./browser.ts", import.meta.url))

test("defines exactly the four required browser profiles", async () => {
  expect(await implementation.exists()).toBe(true)
  const { BROWSER_PROJECTS } = await import("./browser.ts")

  const profiles = BROWSER_PROJECTS.map(({ name, use }) => ({
    browserName: use.browserName,
    name,
  }))

  expect(profiles).toEqual([
    { browserName: "chromium", name: "chromium-mobile" },
    { browserName: "webkit", name: "webkit-mobile" },
    { browserName: "chromium", name: "tablet" },
    { browserName: "chromium", name: "desktop" },
  ])
})
