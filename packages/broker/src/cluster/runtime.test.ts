import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  BrokerEpochSchema,
  ProcessInstanceNonceSchema,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"

import {
  createInternalAuthResponse,
  type InternalAuthChallenge,
  initializeHostSecret,
} from "../security/index.ts"
import {
  BROKER_ORIGIN,
  clusterModule,
  nextWebSocketMessage,
  openWebSocket,
  TEST_CONFIG,
  temporaryStatePaths,
} from "./runtime.test-support.ts"

describe("loopback broker runtime", () => {
  test("elects one member on the fixed loopback address after protocol registration", async () => {
    const { ClusterHealthSchema, startClusterMember } = await clusterModule()
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-runtime-"))
    const member = await startClusterMember({
      config: TEST_CONFIG,
      serverUrl: "http://127.0.0.1:41001",
      statePaths: temporaryStatePaths(fixtureDirectory),
    })

    try {
      const response = await fetch(`${BROKER_ORIGIN}/.well-known/opencode-dispatch/cluster/health`)
      const health = ClusterHealthSchema.parse(await response.json())
      const status = member.status()
      if (status.brokerEpoch === undefined) {
        throw new TypeError("Expected a verified broker epoch.")
      }

      expect(status).toMatchObject({ connected: true, role: "leader" })
      expect(health.brokerEpoch).toBe(status.brokerEpoch)
      expect(new URL(member.brokerUrl).hostname).toBe("127.0.0.1")
      expect(new URL(member.brokerUrl).port).toBe("43110")
    } finally {
      await member.dispose()
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("fails closed without replacing or killing a foreign fixed-port listener", async () => {
    const { startClusterMember } = await clusterModule()
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-runtime-"))
    const foreign = Bun.serve({
      hostname: "127.0.0.1",
      port: 43_110,
      fetch: () => new Response("foreign-listener"),
    })

    try {
      await expect(
        startClusterMember({
          config: TEST_CONFIG,
          serverUrl: "http://127.0.0.1:41002",
          statePaths: temporaryStatePaths(fixtureDirectory),
        }),
      ).rejects.toMatchObject({ code: "foreign_listener" })
      await expect(fetch(BROKER_ORIGIN).then((response) => response.text())).resolves.toBe(
        "foreign-listener",
      )
    } finally {
      await foreign.stop(true)
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("changes epoch once and preserves a live follower exposure after leader disposal", async () => {
    const { startClusterMember } = await clusterModule()
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-runtime-"))
    const paths = temporaryStatePaths(fixtureDirectory)
    const members = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        startClusterMember({
          config: TEST_CONFIG,
          serverUrl: `http://127.0.0.1:${41_100 + index}`,
          statePaths: paths,
        }),
      ),
    )

    try {
      const leader = members.find((member) => member.status().role === "leader")
      const follower = members.find((member) => member.status().role === "follower")
      expect(leader).toBeDefined()
      expect(follower).toBeDefined()
      if (leader === undefined || follower === undefined) {
        throw new TypeError("Expected a leader and follower.")
      }
      const firstEpoch = leader.status().brokerEpoch
      const sessionId = SessionIdSchema.parse("ses-live-failover")
      await follower.enableExposure({
        sessionId,
        title: "Live failover session",
        enabledAt: Date.now(),
      })

      await leader.dispose()
      const replacement = await Promise.any(
        members
          .filter((member) => member !== leader)
          .map(
            (member) =>
              new Promise<ReturnType<typeof member.status>>((resolve, reject) => {
                const timeout = setTimeout(
                  () => reject(new TypeError("Leader failover timed out.")),
                  3_000,
                )
                const unsubscribe = member.subscribe((status) => {
                  const ownsExposure = status.leaderSnapshot?.exposures.some(
                    (exposure) => exposure.sessionId === sessionId,
                  )
                  if (status.role === "leader" && ownsExposure === true) {
                    clearTimeout(timeout)
                    unsubscribe()
                    resolve(status)
                  }
                })
              }),
          ),
      )

      expect(replacement.brokerEpoch).not.toBe(firstEpoch)
      expect(replacement.leaderSnapshot?.exposures.map((item) => item.sessionId)).toContain(
        sessionId,
      )
    } finally {
      await Promise.all(members.map((member) => member.dispose()))
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("rejects a replayed signed membership challenge on a new socket", async () => {
    const module = await clusterModule()
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-runtime-"))
    const paths = temporaryStatePaths(fixtureDirectory)
    const member = await module.startClusterMember({
      config: TEST_CONFIG,
      serverUrl: "http://127.0.0.1:41003",
      statePaths: paths,
    })

    try {
      const secret = await initializeHostSecret(paths)
      const first = await openWebSocket(module.clusterWebSocketUrl(member.brokerUrl))
      const challengeFrame = module.ClusterServerFrameSchema.parse(
        await nextWebSocketMessage(first),
      )
      if (challengeFrame.type !== "auth.challenge") {
        throw new TypeError("Expected an authentication challenge.")
      }
      const challenge: InternalAuthChallenge = challengeFrame.challenge
      const response = createInternalAuthResponse(
        secret,
        challenge,
        module.clusterAuthBinding(challengeFrame.brokerEpoch),
      )
      const authFrame = {
        type: "auth.response",
        version: 1,
        brokerEpoch: challengeFrame.brokerEpoch,
        response,
      }
      first.send(JSON.stringify(authFrame))
      expect(module.ClusterServerFrameSchema.parse(await nextWebSocketMessage(first)).type).toBe(
        "auth.accepted",
      )
      first.close()

      const second = await openWebSocket(module.clusterWebSocketUrl(member.brokerUrl))
      await nextWebSocketMessage(second)
      second.send(JSON.stringify(authFrame))
      const denial = module.ClusterServerFrameSchema.parse(await nextWebSocketMessage(second))

      expect(denial).toMatchObject({ type: "error", code: "auth_replayed" })
      second.close()
    } finally {
      await member.dispose()
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("rejects a split-brain handshake whose WebSocket epoch differs from health", async () => {
    const module = await clusterModule()
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-runtime-"))
    const healthEpoch = BrokerEpochSchema.parse("00000000-0000-4000-8000-000000000010")
    const socketEpoch = BrokerEpochSchema.parse("00000000-0000-4000-8000-000000000011")
    const foreign = Bun.serve({
      hostname: "127.0.0.1",
      port: 43_110,
      fetch(request, server) {
        if (new URL(request.url).pathname.endsWith("/member")) {
          server.upgrade(request)
          return
        }
        return Response.json({
          type: "cluster.health",
          version: 1,
          service: "opencode-dispatch-plugin.cluster",
          brokerEpoch: healthEpoch,
        })
      },
      websocket: {
        open(socket) {
          socket.send(
            JSON.stringify({
              type: "auth.challenge",
              version: 1,
              brokerEpoch: socketEpoch,
              challenge: { issuedAtMs: Date.now(), nonce: "AAAAAAAAAAAAAAAAAAAAAA" },
            }),
          )
        },
        message() {},
      },
    })

    try {
      await expect(
        module.startClusterMember({
          config: TEST_CONFIG,
          processNonce: ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000012"),
          serverUrl: "http://127.0.0.1:41004",
          statePaths: temporaryStatePaths(fixtureDirectory),
        }),
      ).rejects.toMatchObject({ code: "protocol_incompatible" })
    } finally {
      await foreign.stop(true)
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })
})
