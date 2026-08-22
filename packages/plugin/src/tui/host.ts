import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

import type { DispatchMenuOption, DispatchTuiHost } from "./types.ts"

export function createOpenCodeTuiHost(api: TuiPluginApi): DispatchTuiHost {
  return {
    registerCommand: (command) =>
      api.keymap.registerLayer({
        mode: "base",
        commands: [
          {
            name: command.name,
            title: command.title,
            category: command.category,
            namespace: command.namespace,
            slashName: command.slashName,
            run: () => void command.run(),
          },
        ],
      }),
    currentRoute: () => api.route.current,
    sessionTitle: (sessionId) => api.state.session.get(sessionId)?.title,
    showMenu: (menu) => {
      api.ui.dialog.replace(() =>
        api.ui.DialogSelect<DispatchMenuOption>({
          title: menu.title,
          placeholder: menu.summary,
          options: menu.options.map((option) => ({
            title: option.title,
            description: option.description,
            value: option,
            ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
          })),
          onSelect: (selected) => {
            api.ui.dialog.clear()
            void selected.value.onSelect()
          },
        }),
      )
    },
    showConfirm: (confirm) => {
      api.ui.dialog.replace(() =>
        api.ui.DialogConfirm({
          title: confirm.title,
          message: confirm.message,
          onConfirm: () => {
            api.ui.dialog.clear()
            void confirm.onConfirm()
          },
          onCancel: () => api.ui.dialog.clear(),
        }),
      )
    },
    showAlert: (alert) => {
      api.ui.dialog.replace(() =>
        api.ui.DialogAlert({
          title: alert.title,
          message: alert.message,
          onConfirm: () => api.ui.dialog.clear(),
        }),
      )
    },
    toast: (toast) => {
      api.ui.toast({ title: toast.title, message: toast.message, variant: "info" })
    },
    subscribeSessionStatus: (listener) => api.event.on("session.status", () => listener()),
  }
}
