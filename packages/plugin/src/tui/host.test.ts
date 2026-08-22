import { expect, test } from "bun:test"

const hostImplementation = Bun.file(new URL("./host.ts", import.meta.url))

test("adapts documented OpenCode keymap, route, dialog, event, and toast APIs", async () => {
  expect(await hostImplementation.exists()).toBe(true)
  const { createOpenCodeTuiHost } = await import("./host.ts")
  const layers: unknown[] = []
  const dialogs: unknown[] = []
  const toasts: unknown[] = []
  const subscriptions: string[] = []
  let route: unknown = { name: "session", params: { sessionID: "ses-current" } }
  const api = {
    keymap: {
      registerLayer: (layer: unknown) => {
        layers.push(layer)
        return () => {}
      },
    },
    route: {
      get current() {
        return route
      },
    },
    state: { session: { get: (id: string) => ({ id, title: "Current session" }) } },
    ui: {
      dialog: {
        replace: (render: () => unknown) => dialogs.push(render()),
        clear: () => {},
      },
      DialogSelect: (props: unknown) => ({ kind: "select", props }),
      DialogConfirm: (props: unknown) => ({ kind: "confirm", props }),
      DialogAlert: (props: unknown) => ({ kind: "alert", props }),
      toast: (toast: unknown) => toasts.push(toast),
    },
    event: {
      on: (type: string) => {
        subscriptions.push(type)
        return () => {}
      },
    },
  }

  const host = Reflect.apply(createOpenCodeTuiHost, undefined, [api])
  host.registerCommand({
    name: "dispatch.open",
    title: "Dispatch",
    category: "Plugin",
    namespace: "palette",
    slashName: "dispatch",
    run: () => {},
  })
  host.showMenu({ title: "Dispatch", summary: "Ready", options: [] })
  host.showConfirm({ title: "Confirm", message: "Required", onConfirm: () => {} })
  host.showAlert({ title: "Status", message: "Connected" })
  host.toast({ title: "Changed", message: "Enabled" })
  host.subscribeSessionStatus(() => {})

  expect(layers).toEqual([
    expect.objectContaining({
      mode: "base",
      commands: [expect.objectContaining({ name: "dispatch.open", slashName: "dispatch" })],
    }),
  ])
  expect(dialogs).toEqual([
    expect.objectContaining({ kind: "select" }),
    expect.objectContaining({ kind: "confirm" }),
    expect.objectContaining({ kind: "alert" }),
  ])
  expect(toasts).toEqual([{ title: "Changed", message: "Enabled", variant: "info" }])
  expect(subscriptions).toEqual(["session.status"])
  expect(host.currentRoute()).toEqual(route)
  expect(host.sessionTitle("ses-current")).toBe("Current session")

  route = { name: "home" }
  expect(host.currentRoute()).toEqual({ name: "home" })
})
