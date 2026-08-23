import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createTailscaleServeFetch } from "./leader-http.ts"
import { servePwaAsset } from "./pwa-assets.ts"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

async function assetDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "dispatch-pwa-assets-"))
  directories.push(directory)
  await writeFile(join(directory, "index.html"), "<!doctype html><title>Dispatch</title>")
  await writeFile(join(directory, "app.js"), "export const ready = true")
  return directory
}

describe("Serve-target PWA assets", () => {
  test("serves exact prebuilt assets with document security headers", async () => {
    const directory = await assetDirectory()

    const document = await servePwaAsset(new Request("https://dispatch.test/"), directory)
    const script = await servePwaAsset(new Request("https://dispatch.test/app.js"), directory)

    expect(document.status).toBe(200)
    expect(await document.text()).toContain("Dispatch")
    expect(document.headers.get("content-security-policy")).toContain("default-src 'self'")
    expect(document.headers.get("x-content-type-options")).toBe("nosniff")
    expect(document.headers.get("cache-control")).toBe("no-cache")
    expect(script.status).toBe(200)
    expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
  })

  test("does not expose source, traverse the dist root, or provide an SPA fallback", async () => {
    const directory = await assetDirectory()
    const outsideDirectory = await assetDirectory()
    await symlink(join(outsideDirectory, "app.js"), join(directory, "escaped.js"))
    const source = await servePwaAsset(
      new Request("https://dispatch.test/src/index.tsx"),
      directory,
    )
    const traversal = await servePwaAsset(
      new Request("https://dispatch.test/..%2Fpackage.json"),
      directory,
    )
    const fallback = await servePwaAsset(
      new Request("https://dispatch.test/sessions/current"),
      directory,
    )
    const sourceMap = await servePwaAsset(
      new Request("https://dispatch.test/app.js.map"),
      directory,
    )
    const symlinkEscape = await servePwaAsset(
      new Request("https://dispatch.test/escaped.js"),
      directory,
    )

    expect(source.status).toBe(404)
    expect(traversal.status).toBe(404)
    expect(fallback.status).toBe(404)
    expect(sourceMap.status).toBe(404)
    expect(symlinkEscape.status).toBe(404)
  })

  test("supports bodyless HEAD and rejects mutations", async () => {
    const directory = await assetDirectory()
    const head = await servePwaAsset(
      new Request("https://dispatch.test/app.js", { method: "HEAD" }),
      directory,
    )
    const post = await servePwaAsset(
      new Request("https://dispatch.test/app.js", { method: "POST" }),
      directory,
    )

    expect(head.status).toBe(200)
    expect(await head.text()).toBe("")
    expect(post.status).toBe(405)
  })

  test("routes only the exact API version prefix through trusted ingress", async () => {
    const directory = await assetDirectory()
    const calls: string[] = []
    const fetchServeTarget = createTailscaleServeFetch(
      {
        handle(request, ingress) {
          calls.push(`${ingress}:${new URL(request.url).pathname}`)
          return Promise.resolve(new Response(null, { status: 204 }))
        },
        prepareEventStream: async () => undefined,
        publishSignal: async () => undefined,
        revokeSession: () => undefined,
        subscribeEvents: () => () => undefined,
      },
      directory,
    )

    const api = await fetchServeTarget(new Request("https://dispatch.test/api/v1/health"))
    const widened = await fetchServeTarget(new Request("https://dispatch.test/api/v10/health"))

    expect(api.status).toBe(204)
    expect(widened.status).toBe(404)
    expect(calls).toEqual(["trusted_proxy:/api/v1/health"])
  })
})
