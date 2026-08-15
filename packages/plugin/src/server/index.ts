import type { Plugin } from "@opencode-ai/plugin"

import { startOpenCodeServerPlugin } from "./plugin.ts"

export const id = "opencode-dispatch-plugin"

export const server: Plugin = async (input) =>
  startOpenCodeServerPlugin({ serverUrl: input.serverUrl })
