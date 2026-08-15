import { describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  BrokerEpochSchema,
  ProcessInstanceNonceSchema,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"
import { z } from "zod"

const WorkerStatusSchema = z.strictObject({
  type: z.literal("status"),
  memberId: z.string(),
  role: z.enum(["leader", "follower", "disconnected"]),
  connected: z.boolean(),
  brokerEpoch: BrokerEpochSchema.optional(),
  processNonce: ProcessInstanceNonceSchema,
  exposureSessionIds: z.array(SessionIdSchema).readonly(),
})
const EnabledSchema = z.strictObject({ type: z.literal("enabled"), requestId: z.string().uuid() })
type WorkerStatus = z.infer<typeof WorkerStatusSchema>

class ProcessMember {
  readonly memberId: string
  readonly #process: Bun.Subprocess
  readonly #statusListeners = new Set<(status: WorkerStatus) => void>()
  readonly #waiters = new Map<string, () => void>()
  #status: WorkerStatus | undefined

  constructor(memberId: string, stateDirectory: string, reportedPid: number, serverPort: number) {
    this.memberId = memberId
    this.#process = Bun.spawn({
      cmd: [
        process.execPath,
        fileURLToPath(new URL("./process-worker.test-support.ts", import.meta.url)),
      ],
      env: {
        ...process.env,
        DISPATCH_MEMBER_ID: memberId,
        DISPATCH_REPORTED_PID: String(reportedPid),
        DISPATCH_SERVER_PORT: String(serverPort),
        DISPATCH_STATE_DIRECTORY: stateDirectory,
      },
      ipc: (value) => this.#message(value),
      stderr: "inherit",
      stdout: "ignore",
    })
  }

  status(): WorkerStatus | undefined {
    return this.#status
  }

  waitFor(predicate: (status: WorkerStatus) => boolean, timeoutMs = 5_000): Promise<WorkerStatus> {
    const current = this.#status
    if (current !== undefined && predicate(current)) {
      return Promise.resolve(current)
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new TypeError("Process status timed out.")),
        timeoutMs,
      )
      const listener = (status: WorkerStatus): void => {
        if (predicate(status)) {
          clearTimeout(timeout)
          this.#statusListeners.delete(listener)
          resolve(status)
        }
      }
      this.#statusListeners.add(listener)
    })
  }

  async enable(sessionId: string): Promise<void> {
    const requestId = randomUUID()
    const enabled = new Promise<void>((resolve) => this.#waiters.set(requestId, resolve))
    this.#process.send({ type: "enable", requestId, sessionId, title: "Multiprocess session" })
    await enabled
  }

  async kill(): Promise<void> {
    if (this.#process.exitCode === null) {
      this.#process.kill(process.platform === "win32" ? "SIGTERM" : "SIGKILL")
      await this.#process.exited
    }
  }

  async stop(): Promise<void> {
    if (this.#process.exitCode === null) {
      this.#process.kill("SIGTERM")
      await this.#process.exited
    }
  }

  #message(value: unknown): void {
    const status = WorkerStatusSchema.safeParse(value)
    if (status.success) {
      this.#status = status.data
      for (const listener of this.#statusListeners) {
        listener(status.data)
      }
      return
    }
    const enabled = EnabledSchema.safeParse(value)
    if (enabled.success) {
      this.#waiters.get(enabled.data.requestId)?.()
      this.#waiters.delete(enabled.data.requestId)
    }
  }
}

async function startMembers(
  size: number,
  stateDirectory: string,
): Promise<readonly ProcessMember[]> {
  const members = Array.from(
    { length: size },
    (_, index) =>
      new ProcessMember(`member-${index + 1}`, stateDirectory, 9_000 + index, 42_000 + index),
  )
  await Promise.all(members.map((member) => member.waitFor((status) => status.connected)))
  return members
}

async function stopMembers(members: readonly ProcessMember[]): Promise<void> {
  await Promise.all(members.map((member) => member.stop()))
}

describe("multiprocess broker election", () => {
  test.each([1, 3, 10])(
    "elects exactly one leader during simultaneous %i-member startup",
    async (size) => {
      const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-process-"))
      const stateDirectory = join(fixtureDirectory, "state")
      const members = await startMembers(size, stateDirectory)

      try {
        const statuses = members.map((member) => member.status())
        expect(statuses.filter((status) => status?.role === "leader")).toHaveLength(1)
        expect(new Set(statuses.map((status) => status?.brokerEpoch)).size).toBe(1)
        expect(new Set(statuses.map((status) => status?.processNonce)).size).toBe(size)
      } finally {
        await stopMembers(members)
        await rm(fixtureDirectory, { force: true, recursive: true })
      }
    },
    20_000,
  )

  test("elects a new epoch after SIGKILL and restores a live follower exposure", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-process-"))
    const stateDirectory = join(fixtureDirectory, "state")
    const members = await startMembers(3, stateDirectory)

    try {
      const leader = members.find((member) => member.status()?.role === "leader")
      const follower = members.find((member) => member.status()?.role === "follower")
      if (leader === undefined || follower === undefined) {
        throw new TypeError("Expected process leader and follower fixtures.")
      }
      const firstEpoch = leader.status()?.brokerEpoch
      const sessionId = SessionIdSchema.parse("ses-process-failover")
      await follower.enable(sessionId)
      await leader.waitFor((status) => status.exposureSessionIds.includes(sessionId))

      await leader.kill()
      const survivors = members.filter((member) => member !== leader)
      const replacement = await Promise.any(
        survivors.map((member) =>
          member.waitFor(
            (status) => status.role === "leader" && status.exposureSessionIds.includes(sessionId),
          ),
        ),
      )

      expect(replacement.brokerEpoch).not.toBe(firstEpoch)
      expect(replacement.exposureSessionIds).toContain(sessionId)
    } finally {
      await stopMembers(members)
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  }, 20_000)

  test("does not inherit exposure when a replacement process reuses a PID with a new nonce", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-process-"))
    const stateDirectory = join(fixtureDirectory, "state")
    const original = new ProcessMember("member-1", stateDirectory, 9_999, 42_100)
    await original.waitFor((status) => status.connected)

    try {
      const sessionId = SessionIdSchema.parse("ses-restart-isolation")
      await original.enable(sessionId)
      await original.waitFor((status) => status.exposureSessionIds.includes(sessionId))
      const originalNonce = original.status()?.processNonce
      await original.kill()
      const replacement = new ProcessMember("member-2", stateDirectory, 9_999, 42_101)
      try {
        const status = await replacement.waitFor((candidate) => candidate.connected)
        expect(status.processNonce).not.toBe(originalNonce)
        expect(status.exposureSessionIds).toEqual([])
      } finally {
        await replacement.stop()
      }
    } finally {
      await original.stop()
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  }, 20_000)
})
