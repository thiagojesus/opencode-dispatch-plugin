import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

const projectRoot = join(import.meta.dir, "..", "..")

test("rejects an unsafe assignment from unknown", async () => {
  const fixtureDirectory = await mkdtemp(join(projectRoot, ".tmp-typecheck-"))
  const fixturePath = join(fixtureDirectory, "unsafe-assignment.ts")
  const configPath = join(fixtureDirectory, "tsconfig.json")

  await writeFile(
    fixturePath,
    'const untrustedValue: unknown = "external"\nconst trustedValue: string = untrustedValue\nconsole.log(trustedValue)\n',
    "utf8",
  )
  await writeFile(
    configPath,
    `${JSON.stringify({ extends: "../tsconfig.base.json", files: ["unsafe-assignment.ts"] }, null, 2)}\n`,
    "utf8",
  )

  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "x", "tsc", "--noEmit", "--project", configPath, "--pretty", "false"],
      cwd: projectRoot,
      stderr: "pipe",
      stdout: "pipe",
    })
    const compilerOutput = `${result.stdout.toString()}${result.stderr.toString()}`

    expect(result.exitCode).not.toBe(0)
    expect(compilerOutput).toContain("error TS2322")
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true })
  }
})
