import { defineConfig, devices } from "@playwright/test"

const responsiveProjects = [
  { name: "375-light", colorScheme: "light", viewport: { width: 375, height: 812 } },
  { name: "375-dark", colorScheme: "dark", viewport: { width: 375, height: 812 } },
  { name: "768-light", colorScheme: "light", viewport: { width: 768, height: 1_024 } },
  { name: "768-dark", colorScheme: "dark", viewport: { width: 768, height: 1_024 } },
  { name: "1280-light", colorScheme: "light", viewport: { width: 1_280, height: 900 } },
  { name: "1280-dark", colorScheme: "dark", viewport: { width: 1_280, height: 900 } },
] as const

const playwrightConfig = defineConfig({
  testDir: "./tests",
  testMatch: "todo14-*.spec.ts",
  outputDir: "evidence/task-14-opencode-remote-dispatch-plugin/test-results",
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "evidence/task-14-opencode-remote-dispatch-plugin/playwright-results.json" },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:4175",
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"], browserName: "chromium", channel: "chrome" },
    },
    {
      name: "webkit-mobile",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    ...responsiveProjects.map((project) => ({
      name: project.name,
      use: {
        browserName: "chromium" as const,
        channel: "chrome",
        colorScheme: project.colorScheme,
        viewport: project.viewport,
      },
    })),
  ],
  webServer: {
    command: "bun run build && bun run preview --host 127.0.0.1 --port 4175",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4175",
  },
})

// biome-ignore lint/style/noDefaultExport: Playwright requires the configuration as a default export.
export default playwrightConfig
