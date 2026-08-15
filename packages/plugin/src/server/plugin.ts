import type { Hooks } from "@opencode-ai/plugin"
import { type StartClusterMemberInput, startClusterMember } from "@opencode-dispatch/broker/cluster"
import {
  createOpenCodeProcessClient,
  createOpenCodeStatusSeed,
  deriveOpenCodeAuthorization,
  OpenCodeAdapterError,
  type OpenCodeProcessClientInput,
  type OpenCodeServerEnvironment,
  parseOpenCodeSessionSignal,
} from "@opencode-dispatch/broker/opencode"
import { LoopbackServerUrlSchema } from "@opencode-dispatch/contracts"

type ServerPluginInput = {
  readonly serverUrl: URL
}

type ServerPluginMember = {
  dispose(): Promise<void>
  publishOpenCodeSignal(signal: unknown): Promise<void>
}

type StatusClient = {
  statuses(): Promise<Readonly<Record<string, unknown>>>
}

export type OpenCodeServerPluginDependencies = {
  readonly createProcessClient: (input: OpenCodeProcessClientInput) => StatusClient
  readonly env: OpenCodeServerEnvironment
  readonly now: () => number
  readonly startMember: (input: StartClusterMemberInput) => Promise<ServerPluginMember>
}

const password = process.env["OPENCODE_SERVER_PASSWORD"]
const username = process.env["OPENCODE_SERVER_USERNAME"]
const serverEnvironment = {
  ...(password === undefined ? {} : { OPENCODE_SERVER_PASSWORD: password }),
  ...(username === undefined ? {} : { OPENCODE_SERVER_USERNAME: username }),
} satisfies OpenCodeServerEnvironment

const DEFAULT_DEPENDENCIES = {
  createProcessClient: createOpenCodeProcessClient,
  env: serverEnvironment,
  now: Date.now,
  startMember: startClusterMember,
} satisfies OpenCodeServerPluginDependencies

export async function startOpenCodeServerPlugin(
  input: ServerPluginInput,
  dependencies: OpenCodeServerPluginDependencies = DEFAULT_DEPENDENCIES,
): Promise<Pick<Hooks, "dispose" | "event">> {
  const parsedUrl = LoopbackServerUrlSchema.safeParse(input.serverUrl.toString())
  if (!parsedUrl.success) throw new OpenCodeAdapterError("server_url_invalid")
  const authorization = deriveOpenCodeAuthorization(dependencies.env)
  const memberInput: StartClusterMemberInput =
    authorization === undefined
      ? { serverUrl: parsedUrl.data }
      : { authorization, serverUrl: parsedUrl.data }
  const clientInput: OpenCodeProcessClientInput =
    authorization === undefined
      ? { serverUrl: parsedUrl.data }
      : { authorization, serverUrl: parsedUrl.data }
  const member = await dependencies.startMember(memberInput)
  let disposed = false

  try {
    const statuses = await dependencies.createProcessClient(clientInput).statuses()
    for (const sessionId of Object.keys(statuses)) {
      await member.publishOpenCodeSignal(createOpenCodeStatusSeed(sessionId, dependencies.now()))
    }
  } catch (error) {
    await member.dispose()
    throw error
  }

  const event: NonNullable<Hooks["event"]> = async ({ event: upstreamEvent }) => {
    if (disposed) return
    const signal = parseOpenCodeSessionSignal(upstreamEvent, dependencies.now())
    if (signal !== undefined) await member.publishOpenCodeSignal(signal)
  }
  const dispose = async (): Promise<void> => {
    if (disposed) return
    disposed = true
    await member.dispose()
  }
  return { dispose, event }
}
