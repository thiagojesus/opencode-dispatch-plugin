import { defineConfig } from "@playwright/test"

const viewports = [
  { name: "375", width: 375, height: 812, isMobile: true, hasTouch: true },
  { name: "768", width: 768, height: 1024, isMobile: false, hasTouch: true },
  { name: "1280", width: 1280, height: 900, isMobile: false, hasTouch: false },
] as const

const themes = ["light", "dark"] as const

const playwrightConfig = defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  outputDir: "evidence/todo-11/test-results",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "evidence/todo-11/playwright-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: viewports.flatMap((viewport) =>
    themes.map((theme) => ({
      name: `${viewport.name}-${theme}`,
      use: {
        colorScheme: theme,
        hasTouch: viewport.hasTouch,
        isMobile: viewport.isMobile,
        viewport: { width: viewport.width, height: viewport.height },
      },
    })),
  ),
  webServer: {
    command: "bun run build && bun run preview --host 127.0.0.1 --port 4173",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4173",
  },
})

// biome-ignore lint/style/noDefaultExport: Playwright requires the configuration as a default export.
export default playwrightConfig
