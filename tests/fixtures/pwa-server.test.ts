import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const implementation = Bun.file(new URL("./pwa-server.ts", import.meta.url))

test("serves production assets and navigation fallback from an ephemeral loopback port", async () => {
  expect(await implementation.exists()).toBe(true)
  const { startPwaServerFixture } = await import("./pwa-server.ts")
  const rootDirectory = await mkdtemp(join(tmpdir(), "dispatch-pwa-fixture-"))
  await mkdir(join(rootDirectory, "assets"))
  await writeFile(join(rootDirectory, "index.html"), "<!doctype html><title>Fixture PWA</title>")
  await writeFile(join(rootDirectory, "assets", "app.js"), "globalThis.fixtureLoaded = true")
  const server = await startPwaServerFixture({ rootDirectory })

  try {
    const [documentResponse, assetResponse, apiResponse] = await Promise.all([
      fetch(new URL("/session/example", server.origin)),
      fetch(new URL("/assets/app.js", server.origin)),
      fetch(new URL("/api/unknown", server.origin)),
    ])

    expect(new URL(server.origin).hostname).toBe("127.0.0.1")
    expect(await documentResponse.text()).toContain("Fixture PWA")
    expect(assetResponse.headers.get("content-type")).toContain("text/javascript")
    expect(apiResponse.status).toBe(404)
  } finally {
    await server.stop()
    await rm(rootDirectory, { force: true, recursive: true })
  }
})
