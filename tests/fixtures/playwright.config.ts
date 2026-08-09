import { defineConfig } from "@playwright/test"

import { BROWSER_PROJECTS } from "./browser.ts"

const playwrightConfig = defineConfig({
  testDir: "../e2e",
  testMatch: "fixture-profile.spec.ts",
  outputDir: "../../test-results/todo-5",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  projects: BROWSER_PROJECTS,
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
})

// biome-ignore lint/style/noDefaultExport: Playwright requires the configuration as a default export.
export default playwrightConfig
