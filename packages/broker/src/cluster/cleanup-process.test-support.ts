import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { clusterModule, TEST_CONFIG, temporaryStatePaths } from "./runtime.test-support.ts"

const { startClusterMember } = await clusterModule()
const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-exit-"))
const members = await Promise.all(
  Array.from({ length: 3 }, (_, index) =>
    startClusterMember({
      config: TEST_CONFIG,
      serverUrl: `http://127.0.0.1:${43_100 + index}`,
      statePaths: temporaryStatePaths(fixtureDirectory),
    }),
  ),
)

try {
  const leader = members.find((member) => member.status().role === "leader")
  if (leader === undefined) throw new TypeError("Expected a leader fixture.")
  await leader.dispose()
  await Promise.any(
    members
      .filter((member) => member !== leader)
      .map(
        (member) =>
          new Promise<void>((resolve) => {
            const unsubscribe = member.subscribe((status) => {
              if (status.role === "leader") {
                unsubscribe()
                resolve()
              }
            })
          }),
      ),
  )
  await Promise.all(members.map((member) => member.dispose()))
} finally {
  await Promise.all(members.map((member) => member.dispose()))
  await rm(fixtureDirectory, { force: true, recursive: true })
}
