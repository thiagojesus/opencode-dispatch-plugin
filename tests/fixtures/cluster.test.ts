import { expect, test } from "bun:test"

const implementation = Bun.file(new URL("./cluster.ts", import.meta.url))

test("starts independent OpenCode fixture members as real loopback processes", async () => {
  expect(await implementation.exists()).toBe(true)
  const { startClusterFixture } = await import("./cluster.ts")
  const cluster = await startClusterFixture({ size: 2 })

  try {
    const first = await cluster.member(0).health()
    const second = await cluster.member(1).health()

    expect(first.pid).not.toBe(second.pid)
    expect(first.memberId).toBe("member-1")
    expect(second.memberId).toBe("member-2")
    expect(new URL(cluster.member(0).origin).hostname).toBe("127.0.0.1")
    expect(new URL(cluster.member(1).origin).port).not.toBe(new URL(cluster.member(0).origin).port)
  } finally {
    await cluster.stop()
  }
})

test("surfaces a killed fixture process without masking the surviving member", async () => {
  expect(await implementation.exists()).toBe(true)
  const { FixtureProcessExitedError, startClusterFixture } = await import("./cluster.ts")
  const cluster = await startClusterFixture({ size: 2 })

  try {
    await cluster.member(0).kill()

    await expect(cluster.member(0).health()).rejects.toBeInstanceOf(FixtureProcessExitedError)
    await expect(cluster.member(1).health()).resolves.toMatchObject({ memberId: "member-2" })
  } finally {
    await cluster.stop()
  }
})
