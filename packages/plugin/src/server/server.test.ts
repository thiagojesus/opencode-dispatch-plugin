import { expect, test } from "bun:test"

const targetImplementation = Bun.file(new URL("./index.ts", import.meta.url))
const pluginImplementation = Bun.file(new URL("./plugin.ts", import.meta.url))

test("exports only the target-exclusive server module shape", async () => {
  expect(await targetImplementation.exists()).toBe(true)
  const target = await import("./index.ts")

  expect(Object.keys(target).sort()).toEqual(["id", "server"])
  expect(target.id).toBe("opencode-dispatch-plugin")
  expect(typeof target.server).toBe("function")
})

test("rejects a non-loopback server URL before broker registration", async () => {
  expect(await pluginImplementation.exists()).toBe(true)
  const { startOpenCodeServerPlugin } = await import("./plugin.ts")
  let registrations = 0

  await expect(
    startOpenCodeServerPlugin(
      { serverUrl: new URL("https://example.com") },
      {
        createProcessClient: () => ({ statuses: async () => ({}) }),
        env: {},
        now: () => 1_000,
        startMember: async () => {
          registrations += 1
          return {
            dispose: async () => {},
            publishOpenCodeSignal: async () => {},
          }
        },
      },
    ),
  ).rejects.toMatchObject({ code: "server_url_invalid" })
  expect(registrations).toBe(0)
})

test("forwards an isolated broker port override to cluster registration", async () => {
  expect(await pluginImplementation.exists()).toBe(true)
  const { startOpenCodeServerPlugin } = await import("./plugin.ts")
  const registrations: unknown[] = []
  const hooks = await Reflect.apply(startOpenCodeServerPlugin, undefined, [
    {
      serverUrl: new URL("http://127.0.0.1:40996"),
      config: { broker: { port: 45_123 } },
    },
    {
      createProcessClient: () => ({ statuses: async () => ({}) }),
      env: {},
      now: () => 1_500,
      startMember: async (input: unknown) => {
        registrations.push(input)
        return {
          dispose: async () => {},
          publishOpenCodeSignal: async () => {},
        }
      },
    },
  ])

  expect(registrations).toEqual([
    {
      config: { broker: { port: 45_123 } },
      serverUrl: "http://127.0.0.1:40996/",
    },
  ])
  await hooks.dispose?.()
})

test("seeds statuses, forwards live events, and disposes registration exactly once", async () => {
  expect(await pluginImplementation.exists()).toBe(true)
  const { startOpenCodeServerPlugin } = await import("./plugin.ts")
  const published: unknown[] = []
  const registrations: unknown[] = []
  let disposals = 0
  const hooks = await startOpenCodeServerPlugin(
    { serverUrl: new URL("http://127.0.0.1:40999") },
    {
      createProcessClient: (input) => {
        registrations.push({ client: input })
        return { statuses: async () => ({ "ses-plugin": { type: "idle" } }) }
      },
      env: {
        OPENCODE_SERVER_USERNAME: "fixture-user",
        OPENCODE_SERVER_PASSWORD: "fixture-password",
      },
      now: (() => {
        let current = 2_000
        return () => current++
      })(),
      startMember: async (input) => {
        registrations.push({ member: input })
        return {
          dispose: async () => {
            disposals += 1
          },
          publishOpenCodeSignal: async (signal) => {
            published.push(signal)
          },
        }
      },
    },
  )

  expect(registrations).toEqual([
    {
      member: {
        authorization: "Basic Zml4dHVyZS11c2VyOmZpeHR1cmUtcGFzc3dvcmQ=",
        serverUrl: "http://127.0.0.1:40999/",
      },
    },
    {
      client: {
        authorization: "Basic Zml4dHVyZS11c2VyOmZpeHR1cmUtcGFzc3dvcmQ=",
        serverUrl: "http://127.0.0.1:40999/",
      },
    },
  ])
  expect(published).toEqual([
    {
      eventType: "session.status",
      observedAt: 2_000,
      sessionId: "ses-plugin",
      source: "seed",
    },
  ])

  await hooks.event?.({
    event: {
      type: "session.idle",
      properties: { sessionID: "ses-plugin" },
    },
  })
  expect(published[1]).toEqual({
    eventType: "session.idle",
    observedAt: 2_001,
    sessionId: "ses-plugin",
    source: "live",
  })
  expect(JSON.stringify(hooks)).not.toContain("fixture-password")

  await hooks.dispose?.()
  await hooks.dispose?.()
  await hooks.event?.({
    event: { type: "session.idle", properties: { sessionID: "ses-plugin" } },
  })

  expect(disposals).toBe(1)
  expect(published).toHaveLength(2)
})

test("unregisters when status seeding fails", async () => {
  expect(await pluginImplementation.exists()).toBe(true)
  const { startOpenCodeServerPlugin } = await import("./plugin.ts")
  let disposals = 0

  await expect(
    startOpenCodeServerPlugin(
      { serverUrl: new URL("http://127.0.0.1:40998") },
      {
        createProcessClient: () => ({
          statuses: async () => {
            throw new TypeError("fixture status failure")
          },
        }),
        env: {},
        now: () => 3_000,
        startMember: async () => ({
          dispose: async () => {
            disposals += 1
          },
          publishOpenCodeSignal: async () => {},
        }),
      },
    ),
  ).rejects.toThrow("fixture status failure")
  expect(disposals).toBe(1)
})

test("forwards documented compacted and diff events across the broker boundary", async () => {
  expect(await pluginImplementation.exists()).toBe(true)
  const { startOpenCodeServerPlugin } = await import("./plugin.ts")
  const published: unknown[] = []
  const hooks = await startOpenCodeServerPlugin(
    { serverUrl: new URL("http://127.0.0.1:40997") },
    {
      createProcessClient: () => ({ statuses: async () => ({}) }),
      env: {},
      now: (() => {
        let current = 4_000
        return () => current++
      })(),
      startMember: async () => ({
        dispose: async () => {},
        publishOpenCodeSignal: async (signal) => {
          published.push(signal)
        },
      }),
    },
  )

  await hooks.event?.({
    event: { type: "session.compacted", properties: { sessionID: "ses-document-events" } },
  })
  await hooks.event?.({
    event: {
      type: "session.diff",
      properties: { sessionID: "ses-document-events", diff: [] },
    },
  })

  expect(published).toEqual([
    {
      eventType: "session.compacted",
      observedAt: 4_000,
      sessionId: "ses-document-events",
      source: "live",
    },
    {
      eventType: "session.diff",
      observedAt: 4_001,
      sessionId: "ses-document-events",
      source: "live",
    },
  ])
  await hooks.dispose?.()
})
