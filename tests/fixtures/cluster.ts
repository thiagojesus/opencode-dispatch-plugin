import { fileURLToPath } from "node:url"
import { z } from "zod"

import { LoopbackServerUrlSchema } from "../../packages/contracts/src/index.ts"
import {
  FixtureConfigurationError,
  FixtureProcessExitedError,
  FixtureStartupError,
} from "./errors.ts"

const ClusterOptionsSchema = z.strictObject({ size: z.number().int().min(1).max(10) })
const ReadyMessageSchema = z.strictObject({
  memberId: z.string().regex(/^member-[1-9][0-9]*$/u),
  origin: LoopbackServerUrlSchema,
  pid: z.number().int().positive(),
})
const HealthMessageSchema = z.strictObject({
  memberId: z.string().regex(/^member-[1-9][0-9]*$/u),
  pid: z.number().int().positive(),
})

type MemberProcess = {
  readonly exited: Promise<number>
  readonly exitCode: () => number | null
  readonly isRunning: () => boolean
  readonly terminate: () => void
  readonly kill: () => void
}

export type ClusterMemberHealth = z.infer<typeof HealthMessageSchema>

export class ClusterMemberFixture {
  constructor(
    readonly memberId: string,
    readonly origin: string,
    readonly pid: number,
    readonly process: MemberProcess,
  ) {}

  async health(): Promise<ClusterMemberHealth> {
    if (!this.process.isRunning()) {
      throw new FixtureProcessExitedError(this.memberId, this.process.exitCode())
    }
    const response = await fetch(new URL("/health", this.origin))
    const parsed = HealthMessageSchema.safeParse(await response.json())
    if (!response.ok || !parsed.success) {
      throw new FixtureProcessExitedError(this.memberId, this.process.exitCode())
    }
    return parsed.data
  }

  async kill(): Promise<void> {
    if (this.process.isRunning()) {
      this.process.kill()
      await this.process.exited
    }
  }

  async stop(): Promise<void> {
    if (this.process.isRunning()) {
      this.process.terminate()
      await this.process.exited
    }
  }
}

export class ClusterFixture {
  constructor(readonly members: readonly ClusterMemberFixture[]) {}

  member(index: number): ClusterMemberFixture {
    const member = this.members[index]
    if (member === undefined) {
      throw new FixtureConfigurationError("memberIndex")
    }
    return member
  }

  async stop(): Promise<void> {
    await Promise.all(this.members.map((member) => member.stop()))
  }
}

async function readReadyMessage(
  stdout: ReadableStream<Uint8Array>,
  memberId: string,
): Promise<z.infer<typeof ReadyMessageSchema>> {
  const reader = stdout.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (!buffer.includes("\n")) {
      const result = await reader.read()
      if (result.done) {
        throw new FixtureStartupError(memberId)
      }
      buffer += decoder.decode(result.value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  const line = buffer.slice(0, buffer.indexOf("\n"))
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new FixtureStartupError(memberId)
    }
    throw error
  }
  const parsed = ReadyMessageSchema.safeParse(value)
  if (!parsed.success || parsed.data.memberId !== memberId) {
    throw new FixtureStartupError(memberId)
  }
  return parsed.data
}

async function startMember(index: number): Promise<ClusterMemberFixture> {
  const memberId = `member-${index + 1}`
  const subprocess = Bun.spawn({
    cmd: [process.execPath, fileURLToPath(new URL("./cluster-worker.ts", import.meta.url))],
    env: { ...process.env, FIXTURE_MEMBER_ID: memberId },
    stderr: "pipe",
    stdout: "pipe",
  })
  const stdout = subprocess.stdout
  if (!(stdout instanceof ReadableStream)) {
    subprocess.kill()
    throw new FixtureStartupError(memberId)
  }
  try {
    const ready = await readReadyMessage(stdout, memberId)
    return new ClusterMemberFixture(ready.memberId, ready.origin, ready.pid, {
      exited: subprocess.exited,
      exitCode: () => subprocess.exitCode,
      isRunning: () =>
        !subprocess.killed && subprocess.exitCode === null && subprocess.signalCode === null,
      terminate: () => subprocess.kill("SIGTERM"),
      kill: () => subprocess.kill(process.platform === "win32" ? "SIGTERM" : "SIGKILL"),
    })
  } catch (error) {
    subprocess.kill()
    await subprocess.exited
    throw error
  }
}

export async function startClusterFixture(options: {
  readonly size: number
}): Promise<ClusterFixture> {
  const parsed = ClusterOptionsSchema.parse(options)
  const members: ClusterMemberFixture[] = []
  try {
    for (let index = 0; index < parsed.size; index += 1) {
      members.push(await startMember(index))
    }
    return new ClusterFixture(members)
  } catch (error) {
    await Promise.all(members.map((member) => member.stop()))
    throw error
  }
}

export { FixtureProcessExitedError }
