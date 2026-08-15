import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ProcessInstanceNonceSchema } from "@opencode-dispatch/contracts"

import { startClusterMember } from "../cluster/index.ts"
import { TEST_CONFIG, temporaryStatePaths } from "../cluster/runtime.test-support.ts"
import { createOpenCodeStatusSeed, deriveOpenCodeAuthorization } from "./index.ts"

test("keeps authorization and session signals in memory while routing to the exact process", async () => {
  const { startOpenCodeFixture } = await import("../../../../tests/fixtures/open-code.ts")
  const authorization = deriveOpenCodeAuthorization({
    OPENCODE_SERVER_USERNAME: "fixture-user",
    OPENCODE_SERVER_PASSWORD: "fixture-password",
  })
  if (authorization === undefined) throw new TypeError("Expected fixture authorization.")
  const fixture = await startOpenCodeFixture({ compatibility: "1.18.3", authorization })
  const directory = await mkdtemp(join(tmpdir(), "dispatch-opencode-channel-"))
  const member = await startClusterMember({
    authorization,
    config: TEST_CONFIG,
    processNonce: ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000078"),
    serverUrl: fixture.origin,
    statePaths: temporaryStatePaths(directory),
  })

  try {
    await member.publishOpenCodeSignal(createOpenCodeStatusSeed(fixture.scenario.sessionId, 5_000))
    const adapter = member.authoritativeOpenCode()
    if (adapter === undefined) throw new TypeError("Expected the elected leader adapter.")

    expect((await adapter.get(fixture.scenario.sessionId)).id).toBe(fixture.scenario.sessionId)
    expect(JSON.stringify(member.status())).not.toContain(authorization)
    expect(JSON.stringify(member.status())).not.toContain("Fixture transcript")
  } finally {
    await member.dispose()
    await fixture.stop()
    await rm(directory, { force: true, recursive: true })
  }
})

test("replays the latest local live claim after leader replacement", async () => {
  const { startOpenCodeFixture } = await import("../../../../tests/fixtures/open-code.ts")
  const firstFixture = await startOpenCodeFixture({ compatibility: "1.18.3" })
  const secondFixture = await startOpenCodeFixture({ compatibility: "latest-compatible" })
  const directory = await mkdtemp(join(tmpdir(), "dispatch-opencode-channel-"))
  const paths = temporaryStatePaths(directory)
  const first = await startClusterMember({
    config: TEST_CONFIG,
    processNonce: ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000079"),
    serverUrl: firstFixture.origin,
    statePaths: paths,
  })
  const second = await startClusterMember({
    config: TEST_CONFIG,
    processNonce: ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000080"),
    serverUrl: secondFixture.origin,
    statePaths: paths,
  })
  const leader = first.status().role === "leader" ? first : second
  const follower = leader === first ? second : first
  const followerFixture = follower === first ? firstFixture : secondFixture

  try {
    await follower.publishOpenCodeSignal({
      ...createOpenCodeStatusSeed(followerFixture.scenario.sessionId, 6_000),
      source: "live",
    })
    await leader.dispose()
    const replacement = await new Promise<
      NonNullable<ReturnType<typeof follower.authoritativeOpenCode>>
    >((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new TypeError("Leader replacement timed out.")),
        3_000,
      )
      const unsubscribe = follower.subscribe((status) => {
        const adapter = follower.authoritativeOpenCode()
        if (status.role === "leader" && adapter !== undefined) {
          clearTimeout(timeout)
          unsubscribe()
          resolve(adapter)
        }
      })
    })

    expect(replacement.resolveOwner(followerFixture.scenario.sessionId)).toBe(
      follower.status().processNonce,
    )
  } finally {
    await Promise.all([first.dispose(), second.dispose()])
    await Promise.all([firstFixture.stop(), secondFixture.stop()])
    await rm(directory, { force: true, recursive: true })
  }
})
