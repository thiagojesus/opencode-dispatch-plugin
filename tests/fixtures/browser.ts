import { fileURLToPath } from "node:url"
import { test as base, devices, expect, type PlaywrightTestConfig } from "@playwright/test"

import { type PwaServerFixture, startPwaServerFixture } from "./pwa-server.ts"

type BrowserProjects = Exclude<PlaywrightTestConfig["projects"], undefined>

export const BROWSER_PROJECTS = [
  {
    name: "chromium-mobile",
    use: { ...devices["Pixel 5"], browserName: "chromium" },
  },
  {
    name: "webkit-mobile",
    use: { ...devices["iPhone 13"], browserName: "webkit" },
  },
  {
    name: "tablet",
    use: {
      browserName: "chromium",
      hasTouch: true,
      isMobile: false,
      viewport: { width: 768, height: 1_024 },
    },
  },
  {
    name: "desktop",
    use: {
      browserName: "chromium",
      hasTouch: false,
      isMobile: false,
      viewport: { width: 1_280, height: 900 },
    },
  },
] as const satisfies BrowserProjects

type BrowserTestFixtures = {
  readonly fixtureOrigin: string
}

type BrowserWorkerFixtures = {
  readonly pwaServer: PwaServerFixture
}

export const test = base.extend<BrowserTestFixtures, BrowserWorkerFixtures>({
  pwaServer: [
    async ({ browserName: _browserName }, use) => {
      const server = await startPwaServerFixture({
        rootDirectory: fileURLToPath(new URL("../../apps/pwa/dist/", import.meta.url)),
      })
      try {
        await use(server)
      } finally {
        await server.stop()
      }
    },
    { scope: "worker" },
  ],
  fixtureOrigin: async ({ pwaServer }, use) => {
    await use(pwaServer.origin)
  },
})

export { expect }
