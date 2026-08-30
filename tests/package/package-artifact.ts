import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { z } from "zod"

const PackResultSchema = z.array(
  z
    .strictObject({
      filename: z.string(),
      name: z.string(),
      version: z.string(),
    })
    .passthrough(),
)

export type CommandResult = {
  readonly exitCode: number
  readonly stderr: string
  readonly stdout: string
}

export type PackageArtifact = {
  readonly directory: string
  readonly firstHash: string
  readonly secondHash: string
  readonly tarballPath: string
}

type RunCommandInput = {
  readonly argv: readonly string[]
  readonly cwd: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly timeoutMs?: number
}

export class PackageCommandError extends Error {
  override readonly name = "PackageCommandError"
  constructor(readonly result: CommandResult) {
    super(result.stderr || result.stdout || `command exited ${result.exitCode}`)
  }
}

export async function runCommand(input: RunCommandInput): Promise<CommandResult> {
  const subprocess = Bun.spawn([...input.argv], {
    cwd: input.cwd,
    detached: process.platform !== "win32",
    ...(input.env === undefined ? {} : { env: input.env }),
    stdout: "pipe",
    stderr: "pipe",
  })
  const timeoutMs = input.timeoutMs ?? 120_000
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    if (process.platform === "win32") {
      Bun.spawnSync(["taskkill", "/pid", String(subprocess.pid), "/t", "/f"], {
        stderr: "ignore",
        stdout: "ignore",
      })
      return
    }
    try {
      process.kill(-subprocess.pid, "SIGKILL")
    } catch {
      subprocess.kill()
    }
  }, timeoutMs)
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
      subprocess.exited,
    ])
    return {
      exitCode,
      stderr: timedOut ? `${stderr}\ncommand timed out after ${timeoutMs} ms` : stderr,
      stdout,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function requireCommand(input: RunCommandInput): Promise<CommandResult> {
  const result = await runCommand(input)
  if (result.exitCode !== 0) throw new PackageCommandError(result)
  return result
}

async function sha256(path: string): Promise<string> {
  const bytes = await readFile(path)
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

export async function createPackageArtifact(): Promise<PackageArtifact> {
  const packageDirectory = fileURLToPath(new URL("../../packages/plugin/", import.meta.url))
  const directory = await mkdtemp(join(tmpdir(), "dispatch-package-"))
  const firstDirectory = join(directory, "first")
  const secondDirectory = join(directory, "second")
  await Promise.all([
    mkdir(firstDirectory, { recursive: true }),
    mkdir(secondDirectory, { recursive: true }),
  ])
  const first = PackResultSchema.parse(
    JSON.parse(
      (
        await requireCommand({
          argv: ["npm", "pack", "--json", "--pack-destination", firstDirectory],
          cwd: packageDirectory,
        })
      ).stdout,
    ),
  )[0]
  const second = PackResultSchema.parse(
    JSON.parse(
      (
        await requireCommand({
          argv: ["npm", "pack", "--json", "--pack-destination", secondDirectory],
          cwd: packageDirectory,
        })
      ).stdout,
    ),
  )[0]
  if (first === undefined || second === undefined) {
    throw new PackageCommandError({
      exitCode: 1,
      stderr: "npm pack returned no artifact",
      stdout: "",
    })
  }
  const tarballPath = join(firstDirectory, first.filename)
  return {
    directory,
    firstHash: await sha256(tarballPath),
    secondHash: await sha256(join(secondDirectory, second.filename)),
    tarballPath,
  }
}

export async function installPackageArtifact(artifact: PackageArtifact): Promise<string> {
  const consumerDirectory = join(artifact.directory, "consumer")
  await mkdir(consumerDirectory, { recursive: true })
  await writeFile(
    join(consumerDirectory, "package.json"),
    JSON.stringify({ name: "dispatch-package-consumer", private: true, type: "module" }),
  )
  await requireCommand({
    argv: [
      "npm",
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      artifact.tarballPath,
    ],
    cwd: consumerDirectory,
  })
  return consumerDirectory
}

export async function removePackageArtifact(artifact: PackageArtifact): Promise<void> {
  await rm(artifact.directory, { recursive: true, force: true })
}
