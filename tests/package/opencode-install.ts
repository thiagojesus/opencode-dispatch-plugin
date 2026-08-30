import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import type { PackageArtifact } from "./package-artifact.ts"
import {
  type CommandResult,
  PackageCommandError,
  requireCommand,
  runCommand,
} from "./package-artifact.ts"

export type OpenCodeInstall = {
  readonly configDirectory: string
  readonly packageDirectory: string
  readonly serverConfig: string
  readonly tuiConfig: string
}

type InstallOptions = {
  readonly expectFailure?: boolean
  readonly fixtureName?: string
  readonly serverConfig?: string
  readonly tuiConfig?: string
}

const SERVER_COMMENT = "// preserve server comment"
const TUI_COMMENT = "// preserve tui comment"

function opencodeCommand(spec: string): readonly string[] {
  const version = process.env["TODO15_OPENCODE_VERSION"]
  return version === undefined
    ? ["opencode", "--print-logs", "--log-level", "DEBUG", "plugin", spec, "--global"]
    : [
        "bunx",
        "--bun",
        `opencode-ai@${version}`,
        "--print-logs",
        "--log-level",
        "DEBUG",
        "plugin",
        spec,
        "--global",
      ]
}

function opencodeVersion(): string {
  return process.env["TODO15_OPENCODE_VERSION"] ?? "1.18.25"
}

function isolatedEnvironment(root: string, configDirectory: string) {
  const configRoot = join(root, "config")
  const home = join(root, "home")
  return {
    APPDATA: configRoot,
    COMSPEC: process.env["COMSPEC"],
    HOME: home,
    LOCALAPPDATA: join(root, "local-app-data"),
    OPENCODE_CONFIG_DIR: configDirectory,
    OPENCODE_DISABLE_PROJECT_CONFIG: "true",
    PATH: process.env["PATH"],
    PATHEXT: process.env["PATHEXT"],
    SystemRoot: process.env["SystemRoot"],
    TEMP: join(root, "temp"),
    TMP: join(root, "temp"),
    TMPDIR: join(root, "temp"),
    USERPROFILE: home,
    WINDIR: process.env["WINDIR"],
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_CONFIG_HOME: configRoot,
    XDG_DATA_HOME: join(root, "data"),
    XDG_STATE_HOME: join(root, "state"),
  }
}

export async function hashLiveConfigs(): Promise<Readonly<Record<string, string>>> {
  const configRoot =
    process.platform === "win32"
      ? (process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"))
      : (process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"))
  const paths = [
    join(configRoot, "opencode", "opencode.jsonc"),
    join(configRoot, "opencode", "tui.jsonc"),
  ]
  const hashes: Record<string, string> = {}
  for (const path of paths) {
    const file = Bun.file(path)
    hashes[path] = (await file.exists())
      ? createHash("sha256")
          .update(Buffer.from(await file.arrayBuffer()))
          .digest("hex")
      : "missing"
  }
  return hashes
}

async function registryMetadata(artifact: PackageArtifact, tarballUrl: string) {
  const bytes = await readFile(artifact.tarballPath)
  const version = {
    name: "opencode-dispatch-plugin",
    version: "0.1.0",
    type: "module",
    license: "MIT",
    engines: { opencode: ">=1.18.3 <2" },
    exports: {
      "./server": { import: "./dist/server.js" },
      "./tui": { import: "./dist/tui.js" },
    },
    dependencies: {
      "@opencode-ai/sdk": "1.18.3",
      "qrcode-terminal": "0.12.0",
      zod: "4.4.3",
    },
    dist: {
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      shasum: createHash("sha1").update(bytes).digest("hex"),
      tarball: tarballUrl,
    },
  }
  return {
    name: version.name,
    "dist-tags": { latest: version.version },
    versions: { [version.version]: version },
  }
}

export async function installWithOpenCode(
  artifact: PackageArtifact,
  options: InstallOptions = {},
): Promise<OpenCodeInstall> {
  const root = join(artifact.directory, options.fixtureName ?? "opencode-install")
  const configRoot = join(root, "config")
  const configDirectory = join(configRoot, "opencode")
  const workingDirectory = join(root, "work")
  await Promise.all([
    mkdir(configDirectory, { recursive: true }),
    mkdir(join(root, "home"), { recursive: true }),
    mkdir(join(root, "temp"), { recursive: true }),
    mkdir(workingDirectory, { recursive: true }),
  ])
  await Promise.all([
    writeFile(
      join(configDirectory, "opencode.jsonc"),
      options.serverConfig ?? `{\n  ${SERVER_COMMENT},\n  "plugin": []\n}\n`,
    ),
    writeFile(
      join(configDirectory, "tui.jsonc"),
      options.tuiConfig ?? `{\n  ${TUI_COMMENT},\n  "plugin": []\n}\n`,
    ),
  ])
  await requireCommand({
    argv: [
      "npm",
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--omit=optional",
      "--prefix",
      configDirectory,
      `@opencode-ai/plugin@${opencodeVersion()}`,
    ],
    cwd: workingDirectory,
    env: isolatedEnvironment(root, configDirectory),
  })

  let registryOrigin = ""
  const registryRequests: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request): Promise<Response> => {
      const url = new URL(request.url)
      registryRequests.push(`${request.method} ${url.pathname}`)
      if (url.pathname === "/package.tgz") {
        return new Response(Bun.file(artifact.tarballPath), {
          headers: { "content-type": "application/gzip" },
        })
      }
      if (url.pathname === "/opencode-dispatch-plugin") {
        return Response.json(await registryMetadata(artifact, `${registryOrigin}/package.tgz`))
      }
      if (url.pathname === "/-/npm/v1/security/advisories/bulk") return Response.json({})
      const upstream = await fetch(`https://registry.npmjs.org${url.pathname}${url.search}`, {
        headers: { accept: request.headers.get("accept") ?? "application/json" },
      })
      const headers = new Headers(upstream.headers)
      headers.delete("content-encoding")
      headers.delete("content-length")
      return new Response(upstream.body, { headers, status: upstream.status })
    },
  })
  registryOrigin = server.url.origin
  const registry = `${registryOrigin}/`
  const registryEnvironment = {
    ...isolatedEnvironment(root, configDirectory),
    BUN_CONFIG_REGISTRY: registry,
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_OMIT: "optional",
    NPM_CONFIG_REGISTRY: registry,
    npm_config_registry: registry,
  }
  const packageCacheDirectory = join(
    root,
    "cache",
    "opencode",
    "packages",
    "opencode-dispatch-plugin@0.1.0",
  )
  let result: CommandResult
  try {
    await requireCommand({
      argv: [
        "npm",
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--omit=optional",
        "--prefix",
        packageCacheDirectory,
        "opencode-dispatch-plugin@0.1.0",
      ],
      cwd: workingDirectory,
      env: registryEnvironment,
    })
    result = await runCommand({
      argv: opencodeCommand("opencode-dispatch-plugin@0.1.0"),
      cwd: workingDirectory,
      env: registryEnvironment,
    })
  } finally {
    server.stop(true)
  }
  if (result.exitCode === 0 && options.expectFailure === true) {
    throw new PackageCommandError({ ...result, stderr: "OpenCode install unexpectedly succeeded" })
  }
  if (result.exitCode !== 0 && options.expectFailure !== true) {
    throw new PackageCommandError({
      ...result,
      stderr: `${result.stderr}\nregistry requests: ${registryRequests.join(", ") || "none"}`,
    })
  }
  const packageDirectory = join(packageCacheDirectory, "node_modules", "opencode-dispatch-plugin")

  return {
    configDirectory,
    packageDirectory,
    serverConfig: await readFile(join(configDirectory, "opencode.jsonc"), "utf8"),
    tuiConfig: await readFile(join(configDirectory, "tui.jsonc"), "utf8"),
  }
}

export const INSTALL_COMMENTS = { server: SERVER_COMMENT, tui: TUI_COMMENT } as const
