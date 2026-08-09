import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

test("proves an intentionally broken required assertion fails", async () => {
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      "test",
      fileURLToPath(new URL("./self-proof.subject.ts", import.meta.url)),
    ],
    env: { ...process.env, NO_COLOR: "1" },
    stderr: "pipe",
    stdout: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  const output = `${stdout}${stderr}`

  expect(output).toContain('{"actual":404,"kind":"assertion_started"}')
  expect(exitCode).not.toBe(0)
})
