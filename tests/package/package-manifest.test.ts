import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"
import { z } from "zod"

import {
  containsSecret,
  isAllowedPackagePath,
  isExactVersion,
  PACKAGE_POLICY,
} from "./package-policy.ts"

const ExportSchema = z.strictObject({ import: z.string() })
const PackageManifestSchema = z
  .strictObject({
    name: z.string(),
    version: z.string(),
    type: z.literal("module"),
    license: z.string(),
    files: z.array(z.string()),
    engines: z.strictObject({ opencode: z.string() }),
    exports: z.strictObject({
      "./server": ExportSchema,
      "./tui": ExportSchema,
    }),
    scripts: z.record(z.string(), z.string()).optional(),
    dependencies: z.record(z.string(), z.string()),
    devDependencies: z.record(z.string(), z.string()),
  })
  .passthrough()

const PackResultSchema = z.array(
  z
    .strictObject({
      name: z.string(),
      version: z.string(),
      size: z.number().int().nonnegative(),
      unpackedSize: z.number().int().nonnegative(),
      files: z.array(z.strictObject({ path: z.string() }).passthrough()),
    })
    .passthrough(),
)

async function packageManifest(): Promise<z.infer<typeof PackageManifestSchema>> {
  const value: unknown = await Bun.file(
    new URL("../../packages/plugin/package.json", import.meta.url),
  ).json()
  return PackageManifestSchema.parse(value)
}

const packageDirectory = fileURLToPath(new URL("../../packages/plugin/", import.meta.url))

test("declares the publishable dual-target package contract", async () => {
  const manifest = await packageManifest()

  expect(manifest.name).toBe(PACKAGE_POLICY.name)
  expect(manifest.version).toBe(PACKAGE_POLICY.version)
  expect(manifest.license).toBe("MIT")
  expect(manifest.engines).toEqual(PACKAGE_POLICY.engines)
  expect(manifest.files).toEqual([...PACKAGE_POLICY.files])
  expect(manifest.exports).toEqual({
    "./server": { import: "./dist/server.js" },
    "./tui": { import: "./dist/tui.js" },
  })
  expect(manifest).not.toHaveProperty("main")
  expect(manifest).not.toHaveProperty("private")
  expect(manifest.scripts).not.toHaveProperty("install")
  expect(manifest.scripts).not.toHaveProperty("postinstall")
  expect(Object.values(manifest.dependencies).every(isExactVersion)).toBe(true)
  expect(manifest.devDependencies).toEqual({
    "@opencode-ai/plugin": "1.18.3",
    "@opencode-dispatch/broker": "workspace:*",
    "@opencode-dispatch/contracts": "workspace:*",
  })
})

test("packs only allowlisted runtime files within explicit budgets", async () => {
  const subprocess = Bun.spawn(["npm", "pack", "--dry-run", "--json"], {
    cwd: packageDirectory,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ])
  expect(exitCode, stderr).toBe(0)
  const packed = PackResultSchema.parse(JSON.parse(stdout))[0]
  expect(packed).toBeDefined()
  if (packed === undefined) return

  const paths = packed.files.map((file) => file.path)
  expect(paths.every(isAllowedPackagePath)).toBe(true)
  expect(paths.some((path) => path.endsWith(".ts") || path.endsWith(".map"))).toBe(false)
  expect(packed.size).toBeLessThanOrEqual(PACKAGE_POLICY.maximumTarballBytes)
  expect(packed.unpackedSize).toBeLessThanOrEqual(PACKAGE_POLICY.maximumUnpackedBytes)

  const textPaths = paths.filter((path) =>
    /(?:^LICENSE$|\.(?:css|html|js|json|webmanifest))$/u.test(path),
  )
  for (const path of textPaths) {
    const value = await readFile(join(packageDirectory, path), "utf8")
    expect(containsSecret(value), path).toBe(false)
    expect(value, path).not.toContain("sourceMappingURL")
    expect(value, path).not.toMatch(
      /(?:\/Users\/|C:\\Users\\|apps\/pwa\/dist|packages\/(?:broker|contracts)\/src)/u,
    )
  }

  const packageLicense = await readFile(join(packageDirectory, "LICENSE"), "utf8")
  const rootLicense = await readFile(join(packageDirectory, "../../LICENSE"), "utf8")
  expect(packageLicense).toBe(rootLicense)

  const index = await readFile(join(packageDirectory, "dist/pwa/index.html"), "utf8")
  const initialAssets = [...index.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:css|js))"/gu)]
    .map((match) => match[1])
    .filter((path) => path !== undefined)
  const initialCompressedBytes = (
    await Promise.all(
      initialAssets.map(
        async (path) =>
          gzipSync(await readFile(join(packageDirectory, "dist/pwa", path))).byteLength,
      ),
    )
  ).reduce((total, size) => total + size, 0)
  expect(initialAssets.length).toBeGreaterThan(0)
  expect(initialCompressedBytes).toBeLessThanOrEqual(PACKAGE_POLICY.maximumInitialCompressedBytes)
})

test("rejects planted credential material", () => {
  expect(
    containsSecret("github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz_1234567890"),
  ).toBe(true)
  expect(containsSecret("OPENCODE_SERVER_PASSWORD is an environment variable name")).toBe(false)
  expect(containsSecret("AKIAIOSFODNN7EXAMPLE")).toBe(true)
  expect(containsSecret("postgresql://dispatch:secret-value@database.internal/app")).toBe(true)
})
