import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const packageDirectory = fileURLToPath(new URL("../", import.meta.url))
const repositoryDirectory = fileURLToPath(new URL("../../../", import.meta.url))
const outputDirectory = join(packageDirectory, "dist")
const pwaSourceDirectory = join(repositoryDirectory, "apps", "pwa", "dist")
const pwaOutputDirectory = join(outputDirectory, "pwa")
const EXTERNAL_PACKAGES = [
  "@opencode-ai/sdk",
  "@opencode-ai/sdk/*",
  "qrcode-terminal",
  "zod",
] as const

class PackageBuildError extends Error {
  override readonly name = "PackageBuildError"
}

async function buildTarget(name: "server" | "tui"): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(packageDirectory, "src", name, "index.ts")],
    outdir: outputDirectory,
    naming: `${name}.js`,
    format: "esm",
    target: "bun",
    minify: true,
    splitting: false,
    sourcemap: "none",
    external: [...EXTERNAL_PACKAGES],
    define: { __OPENCODE_DISPATCH_PACKAGED__: "true" },
  })
  if (!result.success) {
    throw new PackageBuildError(result.logs.map((message) => message.message).join("\n"))
  }
}

async function stripSourceMapComments(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name)
    if (entry.isDirectory()) {
      await stripSourceMapComments(path)
      continue
    }
    if (!entry.name.endsWith(".js")) continue
    const source = await readFile(path, "utf8")
    const sanitized = source.replace(/^\/\/# sourceMappingURL=.*$/gmu, "")
    if (sanitized !== source) await writeFile(path, sanitized)
  }
}

async function assertRegularTree(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name)
    if (entry.isSymbolicLink()) throw new PackageBuildError(`Symlinked package input: ${path}`)
    if (entry.isDirectory()) {
      await assertRegularTree(path)
      continue
    }
    if (!entry.isFile()) throw new PackageBuildError(`Unsupported package input: ${path}`)
  }
}

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
await Promise.all([buildTarget("server"), buildTarget("tui")])
await mkdir(dirname(pwaOutputDirectory), { recursive: true })
await assertRegularTree(pwaSourceDirectory)
await cp(pwaSourceDirectory, pwaOutputDirectory, {
  recursive: true,
  filter: (source) => !source.endsWith(".map"),
})
await stripSourceMapComments(pwaOutputDirectory)
