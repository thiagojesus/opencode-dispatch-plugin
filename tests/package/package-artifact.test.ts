import { afterAll, beforeAll, expect, test } from "bun:test"
import { access, readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { z } from "zod"
import {
  createPackageArtifact,
  installPackageArtifact,
  type PackageArtifact,
  removePackageArtifact,
} from "./package-artifact.ts"
import { containsSecret, isAllowedPackagePath } from "./package-policy.ts"

const DependencyManifestSchema = z
  .strictObject({ license: z.string().min(1).optional() })
  .passthrough()

let artifact: PackageArtifact | undefined
let consumerDirectory: string

async function extractedFiles(root: string, directory = root): Promise<readonly string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry)
    if ((await stat(path)).isDirectory()) files.push(...(await extractedFiles(root, path)))
    else files.push(path.slice(root.length + 1).replaceAll("\\", "/"))
  }
  return files
}

beforeAll(async () => {
  artifact = await createPackageArtifact()
  consumerDirectory = await installPackageArtifact(artifact)
}, 120_000)

afterAll(async () => {
  if (artifact !== undefined) await removePackageArtifact(artifact)
})

test("produces byte-identical tarballs from unchanged inputs", () => {
  if (artifact === undefined) throw new TypeError("Package artifact setup did not complete")
  expect(artifact.firstHash).toBe(artifact.secondHash)
})

test("scans the files extracted from the actual tarball", async () => {
  const packageDirectory = join(consumerDirectory, "node_modules", "opencode-dispatch-plugin")
  const files = await extractedFiles(packageDirectory)

  expect(files.every(isAllowedPackagePath)).toBe(true)
  for (const path of files.filter((value) =>
    /(?:^LICENSE$|\.(?:css|html|js|json|txt|webmanifest))$/u.test(value),
  )) {
    const contents = await readFile(join(packageDirectory, path), "utf8")
    expect(containsSecret(contents), path).toBe(false)
    expect(contents, path).not.toContain("sourceMappingURL")
    expect(contents, path).not.toMatch(
      /(?:\/Users\/|C:\\Users\\|packages\/(?:broker|contracts)\/src)/u,
    )
  }
})

test("loads both target-exclusive modules without workspace source", async () => {
  const packageDirectory = join(consumerDirectory, "node_modules", "opencode-dispatch-plugin")
  const server = await import(pathToFileURL(join(packageDirectory, "dist", "server.js")).href)
  const tui = await import(pathToFileURL(join(packageDirectory, "dist", "tui.js")).href)

  expect(Object.keys(server).sort()).toEqual(["id", "server"])
  expect(server.id).toBe("opencode-dispatch-plugin")
  expect(typeof server.server).toBe("function")
  expect(Object.keys(tui)).toEqual(["default"])
  expect(Object.keys(tui.default).sort()).toEqual(["id", "tui"])
  expect(typeof tui.default.tui).toBe("function")
  expect(await Bun.file(join(packageDirectory, "dist", "pwa", "index.html")).exists()).toBe(true)
  expect(await Bun.file(join(packageDirectory, "src", "server", "index.ts")).exists()).toBe(false)
})

test("launches both packed targets from the disposable installation", async () => {
  if (artifact === undefined) throw new TypeError("Package artifact setup did not complete")
  const packageDirectory = join(consumerDirectory, "node_modules", "opencode-dispatch-plugin")
  const serverTarget = await import(pathToFileURL(join(packageDirectory, "dist", "server.js")).href)
  const tuiTarget = await import(pathToFileURL(join(packageDirectory, "dist", "tui.js")).href)
  const openCode = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => Response.json({}),
  })
  const reserved = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
  const brokerPort = reserved.port
  await reserved.stop(true)
  const previousStateRoot = process.env["XDG_STATE_HOME"]
  process.env["XDG_STATE_HOME"] = join(artifact.directory, "packed-target-state")
  let disposeServer: (() => Promise<void>) | undefined
  let disposeTui: (() => Promise<void>) | undefined
  let commandRegistered = false

  try {
    const hooks = await serverTarget.server(
      { serverUrl: new URL(openCode.url) },
      { port: brokerPort },
    )
    disposeServer = hooks.dispose
    const health = await fetch(
      `http://127.0.0.1:${brokerPort}/.well-known/opencode-dispatch/cluster/health`,
    )
    expect(health.status).toBe(200)

    await tuiTarget.default.tui({
      event: { on: () => () => {} },
      keymap: {
        registerLayer: () => {
          commandRegistered = true
          return () => {
            commandRegistered = false
          }
        },
      },
      lifecycle: {
        onDispose: (dispose: () => Promise<void>) => {
          disposeTui = dispose
        },
      },
      route: { current: { type: "home" } },
      state: { session: { get: () => undefined } },
      ui: {
        DialogAlert: () => undefined,
        DialogConfirm: () => undefined,
        DialogSelect: () => undefined,
        dialog: { clear: () => {}, replace: () => {} },
        toast: () => {},
      },
    })
    expect(commandRegistered).toBe(true)
  } finally {
    await disposeTui?.()
    await disposeServer?.()
    await openCode.stop(true)
    if (previousStateRoot === undefined) delete process.env["XDG_STATE_HOME"]
    else process.env["XDG_STATE_HOME"] = previousStateRoot
  }

  expect(commandRegistered).toBe(false)
}, 120_000)

test("ships licenses for every direct runtime dependency without TUI peer installs", async () => {
  for (const dependency of ["@opencode-ai/sdk", "qrcode-terminal", "zod"]) {
    const dependencyDirectory = join(consumerDirectory, "node_modules", ...dependency.split("/"))
    const manifestValue: unknown = JSON.parse(
      await readFile(join(dependencyDirectory, "package.json"), "utf8"),
    )
    const manifest = DependencyManifestSchema.parse(manifestValue)
    if (manifest.license === undefined) {
      await access(join(dependencyDirectory, "LICENSE"))
    }
  }
  expect(await Bun.file(join(consumerDirectory, "node_modules", "@opentui", "core")).exists()).toBe(
    false,
  )
})
