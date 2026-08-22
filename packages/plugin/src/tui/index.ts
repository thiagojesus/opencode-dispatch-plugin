import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"

import { createLocalDispatchControlClient } from "./control-client.ts"
import { initializeDispatchTui } from "./controller.ts"
import { createOpenCodeTuiHost } from "./host.ts"
import { copyRemoteUrl, renderRemoteQr } from "./terminal.ts"

const tui: TuiPlugin = async (api) => {
  const dispose = await initializeDispatchTui(createOpenCodeTuiHost(api), {
    control: createLocalDispatchControlClient(),
    copyText: copyRemoteUrl,
    renderQr: renderRemoteQr,
  })
  api.lifecycle.onDispose(dispose)
}

const plugin = {
  id: "opencode-dispatch-plugin",
  tui,
} satisfies TuiPluginModule & { readonly id: string }

// biome-ignore lint/style/noDefaultExport: OpenCode's TUI loader reads only the default target object.
export default plugin
