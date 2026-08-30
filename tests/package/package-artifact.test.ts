import { afterAll, beforeAll, expect, test } from "bun:test"
import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { z } from "zod"

import {
  createPackageArtifact,
  installPackageArtifact,
  type PackageArtifact,
  removePackageArtifact,
} from "./package-artifact.ts"

const DependencyManifestSchema = z
  .strictObject({ license: z.string().min(1).optional() })
  .passthrough()

let artifact: PackageArtifact | undefined
let consumerDirectory: string

beforeAll(async () => {
  artifact = await createPackageArtifact()
  consumerDirectory = await installPackageArtifact(artifact)
})

afterAll(async () => {
  if (artifact !== undefined) await removePackageArtifact(artifact)
})

test("produces byte-identical tarballs from unchanged inputs", () => {
  if (artifact === undefined) throw new TypeError("Package artifact setup did not complete")
  expect(artifact.firstHash).toBe(artifact.secondHash)
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
