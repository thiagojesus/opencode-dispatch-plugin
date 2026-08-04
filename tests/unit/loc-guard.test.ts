import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const projectRoot = join(import.meta.dir, "..", "..")
const locGuardPath = join(projectRoot, "scripts", "check-loc.ts")

type Fixture = {
  readonly directory: string
  readonly filePath: string
}

type LocGuardResult = {
  readonly exitCode: number
  readonly stderr: Uint8Array
  readonly stdout: Uint8Array
}

async function createFixture(pureLineCount: number): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "opencode-dispatch-loc-"))
  const filePath = join(directory, `${pureLineCount}-pure-loc.ts`)
  const source = Array.from(
    { length: pureLineCount },
    (_, index) => `export const line${index + 1} = ${index + 1}`,
  ).join("\n")

  await writeFile(filePath, `${source}\n`, "utf8")
  return { directory, filePath }
}

function runLocGuard(filePath: string): LocGuardResult {
  return Bun.spawnSync({
    cmd: [process.execPath, "run", locGuardPath, filePath],
    cwd: projectRoot,
    stderr: "pipe",
    stdout: "pipe",
  })
}

describe("TypeScript module pure-LOC guard", () => {
  test("rejects a named 251-pure-LOC fixture", async () => {
    const fixture = await createFixture(251)

    try {
      const result = runLocGuard(fixture.filePath)

      expect(result.exitCode).toBe(1)
      expect(result.stderr.toString()).toContain("251-pure-loc.ts: 251 pure LOC exceeds limit 250")
    } finally {
      await rm(fixture.directory, { force: true, recursive: true })
    }
  })

  test("accepts a named 250-pure-LOC fixture", async () => {
    const fixture = await createFixture(250)

    try {
      const result = runLocGuard(fixture.filePath)

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain(
        "Checked 1 TypeScript module; all are within 250 pure LOC.",
      )
    } finally {
      await rm(fixture.directory, { force: true, recursive: true })
    }
  })
})
