import { defineConfig } from "@playwright/test"

const projects = [
  { name: "375-light", colorScheme: "light", viewport: { width: 375, height: 812 } },
  { name: "768-dark", colorScheme: "dark", viewport: { width: 768, height: 1024 } },
  { name: "1280-light", colorScheme: "light", viewport: { width: 1280, height: 900 } },
] as const

const port = Number.parseInt(process.env["TODO12_PLAYWRIGHT_PORT"] ?? "4173", 10)
const baseURL = `http://127.0.0.1:${port}`

// biome-ignore lint/style/noDefaultExport: Playwright requires a default configuration export.
export default defineConfig({
  testDir: "./tests",
  testMatch: "session-flow.spec.ts",
  outputDir: "evidence/task-12-opencode-remote-dispatch-plugin/test-results",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    browserName: "chromium",
    channel: "chrome",
    screenshot: "on",
    trace: "retain-on-failure",
  },
  projects: projects.map((project) => ({
    name: project.name,
    use: { colorScheme: project.colorScheme, viewport: project.viewport },
  })),
  webServer: {
    command: `bun run build && bun run preview --host 127.0.0.1 --port ${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
})
