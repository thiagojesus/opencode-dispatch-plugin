import { expect, test } from "bun:test"

import {
  FakeDispatchControl,
  FakeTuiHost,
  option,
  READY_SNAPSHOT,
  type TestSnapshot,
} from "./test-support.ts"

const controllerImplementation = Bun.file(new URL("./controller.ts", import.meta.url))

type InitializeFixture = {
  readonly host: FakeTuiHost
  readonly control: FakeDispatchControl
  readonly copied?: string[]
  readonly rendered?: string[]
}

async function initialize(fixture: InitializeFixture): Promise<() => Promise<void>> {
  expect(await controllerImplementation.exists()).toBe(true)
  const { initializeDispatchTui } = await import("./controller.ts")
  const copied = fixture.copied ?? []
  const rendered = fixture.rendered ?? []
  return Reflect.apply(initializeDispatchTui, undefined, [
    fixture.host,
    {
      control: fixture.control,
      copyText: async (value: string) => {
        copied.push(value)
      },
      renderQr: (value: string) => {
        rendered.push(value)
        return `QR<${value}>`
      },
    },
  ])
}

test("registers one palette and slash command and cleans every subscription once", async () => {
  const host = new FakeTuiHost()
  const control = new FakeDispatchControl()
  const dispose = await initialize({ host, control })

  expect(host.commands).toHaveLength(1)
  expect(host.commands[0]).toMatchObject({
    name: "dispatch.open",
    title: "Dispatch",
    category: "Plugin",
    namespace: "palette",
    slashName: "dispatch",
  })

  await dispose()
  await dispose()

  expect(host.commandDisposals).toBe(1)
  expect(host.statusDisposals).toBe(1)
  expect(control.subscriptionDisposals).toBe(1)
  expect(control.disposals).toBe(1)
})

test("uses the current route at invocation and never offers arbitrary session control", async () => {
  const host = new FakeTuiHost()
  const control = new FakeDispatchControl()
  const dispose = await initialize({ host, control })

  host.route = { name: "session", params: { sessionID: "ses-current" } }
  await host.commands[0]?.run()
  expect(host.menus.at(-1)?.options.map((item) => item.id)).toEqual([
    "enable",
    "disable",
    "status",
    "tailscale",
    "qr",
    "copy",
    "diagnostics",
  ])

  host.route = { name: "home" }
  await host.commands[0]?.run()
  expect(host.menus.at(-1)?.summary).toContain("Enabled session")
  expect(host.menus.at(-1)?.options.map((item) => item.id)).toEqual([
    "status",
    "tailscale",
    "qr",
    "copy",
    "diagnostics",
  ])

  host.route = { name: "plugin-route", params: { sessionID: "ses-foreign" } }
  await host.commands[0]?.run()
  expect(host.menus.at(-1)?.options.map((item) => item.id)).not.toContain("enable")
  expect(JSON.stringify(host.menus.at(-1))).not.toContain("ses-foreign")

  Reflect.set(host, "route", { name: "session", params: { sessionID: 42 } })
  await host.commands[0]?.run()
  expect(host.menus.at(-1)?.options.map((item) => item.id)).not.toContain("enable")
  await dispose()
})

test("requires confirmation and keeps enable and disable idempotent", async () => {
  const host = new FakeTuiHost()
  host.route = { name: "session", params: { sessionID: "ses-current" } }
  const control = new FakeDispatchControl()
  const dispose = await initialize({ host, control })

  await host.commands[0]?.run()
  await option(host, "enable").onSelect()
  expect(control.enabled).toEqual([])
  await host.confirms.at(-1)?.onConfirm()
  expect(control.enabled).toEqual(["ses-current"])

  await host.commands[0]?.run()
  await option(host, "enable").onSelect()
  expect(control.enabled).toEqual(["ses-current"])
  expect(host.toasts.at(-1)?.message).toContain("already enabled")

  await option(host, "disable").onSelect()
  expect(control.disabled).toEqual([])
  await host.confirms.at(-1)?.onConfirm()
  expect(control.disabled).toEqual(["ses-current"])

  await host.commands[0]?.run()
  await option(host, "disable").onSelect()
  expect(control.disabled).toEqual(["ses-current"])
  expect(host.toasts.at(-1)?.message).toContain("already disabled")
  await dispose()
})

test("follows broker epoch updates and renders only privacy-safe diagnostics", async () => {
  const host = new FakeTuiHost()
  const control = new FakeDispatchControl()
  const dispose = await initialize({ host, control })

  await host.commands[0]?.run()
  const updated: TestSnapshot = {
    ...READY_SNAPSHOT,
    brokerEpoch: "00000000-0000-4000-8000-000000000002",
    diagnostics: { broker: "reconnected", registration: "live" },
  }
  control.emit(updated)
  await option(host, "status").onSelect()
  expect(host.alerts.at(-1)?.message).toContain(updated.brokerEpoch)

  await option(host, "diagnostics").onSelect()
  const serialized = JSON.stringify({ alerts: host.alerts, menus: host.menus })
  expect(serialized).not.toContain("HOST_SECRET_SENTINEL")
  expect(serialized).not.toContain("TRANSCRIPT_SENTINEL")
  expect(serialized).not.toContain("/Users/private/project")
  expect(serialized).not.toContain("Authorization")
  await dispose()
})

test("renders and copies only an HTTPS stable host or enabled-session route", async () => {
  const host = new FakeTuiHost()
  host.route = { name: "session", params: { sessionID: "ses-enabled" } }
  const control = new FakeDispatchControl()
  const copied: string[] = []
  const rendered: string[] = []
  const dispose = await initialize({ host, control, copied, rendered })

  await host.commands[0]?.run()
  await option(host, "qr").onSelect()
  await option(host, "copy").onSelect()

  const expected = "https://workstation.example.ts.net/sessions/ses-enabled"
  expect(rendered).toEqual([expected])
  expect(copied).toEqual([expected])
  expect(host.alerts.at(-1)?.message).toContain(`QR<${expected}>`)
  expect(JSON.stringify({ rendered, copied })).not.toMatch(/Bearer|token|secret|\?/iu)

  host.route = { name: "session", params: { sessionID: "ses-current" } }
  await host.commands[0]?.run()
  await option(host, "qr").onSelect()
  expect(rendered).toEqual([expected])
  expect(host.alerts.at(-1)?.message).toContain("Enable this session first")

  host.route = { name: "home" }
  await host.commands[0]?.run()
  await option(host, "copy").onSelect()
  expect(copied.at(-1)).toBe("https://workstation.example.ts.net/sessions")
  await dispose()
})

test("maps control and setup failures to fixed actionable dialogs", async () => {
  const failureCases = [
    ["broker_unavailable", "Start OpenCode locally"],
    ["foreign_listener", "Another service is using the dispatch port"],
    ["registration_expired", "Open the session in its live OpenCode process"],
    ["session_missing", "Open a live session before using this action"],
    ["malformed_response", "The local dispatch response was rejected"],
  ] as const

  for (const [code, expected] of failureCases) {
    const host = new FakeTuiHost()
    const control = new FakeDispatchControl()
    control.failureCode = code
    const dispose = await initialize({ host, control })

    await host.commands[0]?.run()
    expect(host.alerts.at(-1)?.message).toContain(expected)
    expect(host.alerts.at(-1)?.message).not.toContain("fixture")
    await dispose()
  }

  const host = new FakeTuiHost()
  const control = new FakeDispatchControl()
  control.snapshotValue = { ...READY_SNAPSHOT, tailscale: { kind: "cli_missing" } }
  const dispose = await initialize({ host, control })
  await host.commands[0]?.run()
  await option(host, "tailscale").onSelect()
  expect(host.alerts.at(-1)?.message).toContain("Install Tailscale manually")
  expect(host.alerts.at(-1)?.message).not.toContain("sudo")
  await dispose()
})
