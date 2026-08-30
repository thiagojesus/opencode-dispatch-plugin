import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

type PrecacheEntry = {
  readonly revision: string
  readonly url: string
}

const SERVICE_WORKER_PATH = fileURLToPath(new URL("../../apps/pwa/dist/sw.js", import.meta.url))

function precacheEntries(source: string): readonly PrecacheEntry[] {
  const entries: PrecacheEntry[] = []
  const pattern = /\{url:"([^"]+)",revision:(null|"[a-f0-9]+")\}/gu
  for (const match of source.matchAll(pattern)) {
    const url = match[1]
    const revision = match[2]
    if (revision !== undefined && url !== undefined) entries.push({ revision, url })
  }
  return entries
}

function isContentAddressedShellEntry(entry: PrecacheEntry): boolean {
  if (/^assets\/.+-[A-Za-z0-9_-]{8,}\.(?:css|js)$/u.test(entry.url)) {
    return entry.revision === "null"
  }
  return (
    !entry.url.includes("/") &&
    /\.(?:html|ico|png|svg|webmanifest)$/u.test(entry.url) &&
    /^"[a-f0-9]{32}"$/u.test(entry.revision)
  )
}

test("production service worker precaches only content-addressed shell files", async () => {
  const source = await readFile(SERVICE_WORKER_PATH, "utf8")
  const entries = precacheEntries(source)
  const urls = entries.map((entry) => entry.url)

  expect(entries.length).toBeGreaterThan(0)
  expect(new Set(urls).size).toBe(urls.length)
  expect(entries.every(isContentAddressedShellEntry)).toBe(true)
  expect(urls.some((url) => /api|session|transcript|websocket/iu.test(url))).toBe(false)
})
