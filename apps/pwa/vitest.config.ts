import solidPlugin from "vite-plugin-solid"
import { defineConfig } from "vitest/config"

const vitestConfig = defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    conditions: ["development", "browser"],
  },
  test: {
    environment: "happy-dom",
    include: ["tests/components/**/*.test.tsx"],
  },
})

// biome-ignore lint/style/noDefaultExport: Vitest requires the configuration as a default export.
export default vitestConfig
