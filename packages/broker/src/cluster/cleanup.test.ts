import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  BROKER_ORIGIN,
  clusterModule,
  TEST_CONFIG,
  temporaryStatePaths,
} from "./runtime.test-support.ts"

test("joins an in-flight follower election before disposal completes", async () => {
  const baselineTimeouts = process
    .getActiveResourcesInfo()
    .filter((resource) => resource === "Timeout").length
  const { startClusterMember } = await clusterModule()
  const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-cleanup-"))
  const paths = temporaryStatePaths(fixtureDirectory)
  const members = await Promise.all(
    Array.from({ length: 3 }, (_, index) =>
      startClusterMember({
        config: TEST_CONFIG,
        serverUrl: `http://127.0.0.1:${43_100 + index}`,
        statePaths: paths,
      }),
    ),
  )

  try {
    const leader = members.find((member) => member.status().role === "leader")
    if (leader === undefined) {
      throw new TypeError("Expected a leader fixture.")
    }
    await leader.dispose()
    await Promise.any(
      members
        .filter((member) => member !== leader)
        .map(
          (member) =>
            new Promise<void>((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new TypeError("Leader failover timed out.")),
                3_000,
              )
              const unsubscribe = member.subscribe((status) => {
                if (status.role === "leader") {
                  clearTimeout(timer)
                  unsubscribe()
                  resolve()
                }
              })
            }),
        ),
    )

    await Promise.race([
      Promise.all(members.map((member) => member.dispose())),
      new Promise((_, reject) =>
        setTimeout(() => reject(new TypeError("Cluster disposal timed out.")), 2_000),
      ),
    ])

    await expect(
      fetch(`${BROKER_ORIGIN}/.well-known/opencode-dispatch/cluster/health`, {
        signal: AbortSignal.timeout(250),
      }),
    ).rejects.toBeDefined()
    await Bun.sleep(0)
    const remainingTimeouts = process
      .getActiveResourcesInfo()
      .filter((resource) => resource === "Timeout").length
    expect(remainingTimeouts).toBeLessThanOrEqual(baselineTimeouts)
  } finally {
    await Promise.all(members.map((member) => member.dispose()))
    await rm(fixtureDirectory, { force: true, recursive: true })
  }
}, 10_000)

test("allows a three-member process to exit naturally after failover disposal", async () => {
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      fileURLToPath(new URL("./cleanup-process.test-support.ts", import.meta.url)),
    ],
    stderr: "inherit",
    stdout: "ignore",
  })
  try {
    const exitCode = await Promise.race([child.exited, Bun.sleep(2_000).then(() => undefined)])
    expect(exitCode).toBe(0)
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGKILL")
      await child.exited
    }
  }
}, 5_000)
