import { expect, test } from "bun:test"

import { startOpenCodeFixture } from "./open-code.ts"

test("INTENTIONAL fixture guard detects false success", async () => {
  const fixture = await startOpenCodeFixture({ compatibility: "1.18.3" })

  try {
    const response = await fetch(new URL("/undocumented", fixture.origin))
    process.stdout.write(
      `${JSON.stringify({ actual: response.status, kind: "assertion_started" })}\n`,
    )

    expect(response.status).toBe(200)
  } finally {
    await fixture.stop()
  }
})
