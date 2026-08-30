import { afterAll, beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import {
  hashLiveConfigs,
  INSTALL_COMMENTS,
  installWithOpenCode,
  type OpenCodeInstall,
} from "./opencode-install.ts"
import {
  createPackageArtifact,
  type PackageArtifact,
  removePackageArtifact,
} from "./package-artifact.ts"

let artifact: PackageArtifact | undefined
let install: OpenCodeInstall
let liveConfigBefore: Readonly<Record<string, string>>
let liveConfigAfter: Readonly<Record<string, string>>

beforeAll(async () => {
  artifact = await createPackageArtifact()
  liveConfigBefore = await hashLiveConfigs()
  install = await installWithOpenCode(artifact)
  liveConfigAfter = await hashLiveConfigs()
}, 120_000)

afterAll(async () => {
  if (artifact !== undefined) await removePackageArtifact(artifact)
})

test("uses official global target detection inside the isolated config directory", async () => {
  expect(install.serverConfig).toContain(INSTALL_COMMENTS.server)
  expect(install.tuiConfig).toContain(INSTALL_COMMENTS.tui)
  expect(install.serverConfig).toContain("opencode-dispatch-plugin@0.1.0")
  expect(install.tuiConfig).toContain("opencode-dispatch-plugin@0.1.0")
  expect(await Bun.file(join(install.packageDirectory, "dist", "server.js")).exists()).toBe(true)
  expect(await Bun.file(join(install.packageDirectory, "dist", "tui.js")).exists()).toBe(true)
})

test("loads the official installation without workspace or missing TUI peers", async () => {
  const server = await import(pathToFileURL(join(install.packageDirectory, "dist/server.js")).href)
  const tui = await import(pathToFileURL(join(install.packageDirectory, "dist/tui.js")).href)

  expect(Object.keys(server).sort()).toEqual(["id", "server"])
  expect(Object.keys(tui)).toEqual(["default"])
  expect(await Bun.file(join(install.configDirectory, "node_modules", "@opentui")).exists()).toBe(
    false,
  )
})

test("leaves the live OpenCode configuration byte-identical", () => {
  expect(liveConfigAfter).toEqual(liveConfigBefore)
})

test("fails closed without partially mutating malformed JSONC", async () => {
  if (artifact === undefined) throw new TypeError("Package artifact setup did not complete")
  const malformed = `{\n  ${INSTALL_COMMENTS.server},\n  "plugin": [}\n`
  const validTui = `{\n  ${INSTALL_COMMENTS.tui},\n  "plugin": []\n}\n`
  const failed = await installWithOpenCode(artifact, {
    expectFailure: true,
    fixtureName: "opencode-malformed-install",
    serverConfig: malformed,
    tuiConfig: validTui,
  })

  expect(failed.serverConfig).toBe(malformed)
  expect(failed.tuiConfig).toBe(validTui)
  expect(await hashLiveConfigs()).toEqual(liveConfigBefore)
}, 120_000)
