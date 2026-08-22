import { expect, test } from "bun:test"
import { Buffer } from "node:buffer"

const terminalImplementation = Bun.file(new URL("./terminal.ts", import.meta.url))

test("renders a terminal QR only for a credential-free HTTPS route", async () => {
  expect(await terminalImplementation.exists()).toBe(true)
  const { renderRemoteQr } = await import("./terminal.ts")
  const route = "https://workstation.example.ts.net/sessions/ses-current"

  const qr = renderRemoteQr(route)

  expect(qr.length).toBeGreaterThan(100)
  expect(qr).toMatch(/[▀▄█]/u)
  expect(qr).not.toContain("secret")
  expect(() => renderRemoteQr("http://workstation.example.ts.net/sessions")).toThrow()
  expect(() => renderRemoteQr(`${route}?token=sentinel`)).toThrow()
  expect(() =>
    renderRemoteQr("https://user:password@workstation.example.ts.net/sessions"),
  ).toThrow()
})

test("copies through OSC52 without shelling out or exposing another value", async () => {
  expect(await terminalImplementation.exists()).toBe(true)
  const { createOsc52Clipboard } = await import("./terminal.ts")
  const writes: string[] = []
  const route = "https://workstation.example.ts.net/sessions"
  const copy = createOsc52Clipboard({
    isTTY: true,
    multiplexed: false,
    write: (value: string) => {
      writes.push(value)
    },
  })

  await copy(route)

  expect(writes).toHaveLength(1)
  const prefix = "\x1b]52;c;"
  const suffix = "\x07"
  expect(writes[0]?.startsWith(prefix)).toBe(true)
  expect(writes[0]?.endsWith(suffix)).toBe(true)
  const payload = writes[0]?.slice(prefix.length, -suffix.length)
  expect(payload).toBeDefined()
  expect(Buffer.from(payload ?? "", "base64").toString("utf8")).toBe(route)
})

test("fails closed when the terminal cannot receive OSC52", async () => {
  expect(await terminalImplementation.exists()).toBe(true)
  const { createOsc52Clipboard } = await import("./terminal.ts")
  const copy = createOsc52Clipboard({ isTTY: false, multiplexed: false, write: () => {} })

  await expect(copy("https://workstation.example.ts.net/sessions")).rejects.toMatchObject({
    code: "control_rejected",
  })
})
