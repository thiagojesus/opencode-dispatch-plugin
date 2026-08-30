import type { Plugin } from "@opencode-ai/plugin"
import { parseDispatchPluginOptions } from "../options.ts"
import { startOpenCodeServerPlugin } from "./plugin.ts"

export const id = "opencode-dispatch-plugin"

export const server: Plugin = async (input, options) => {
  const parsed = parseDispatchPluginOptions(options)
  return startOpenCodeServerPlugin({
    serverUrl: input.serverUrl,
    config: { broker: { port: parsed.port } },
  })
}
