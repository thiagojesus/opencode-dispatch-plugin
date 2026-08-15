import { randomUUID } from "node:crypto"

import {
  DEFAULT_BROKER_PORT,
  DispatchConfigSchema,
  LoopbackServerUrlSchema,
  ProcessIdSchema,
  ProcessInstanceNonceSchema,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"
import { BasicAuthorizationSchema } from "../opencode/index.ts"
import {
  initializeHostSecret,
  resolveCurrentSecurityStatePaths,
  type SecurityStatePaths,
} from "../security/index.ts"
import { ClusterError } from "./errors.ts"
import { ClusterMember } from "./member.ts"
import { ClusterStateStore } from "./state-store.ts"

export type StartClusterMemberInput = {
  readonly authorization?: unknown
  readonly config?: unknown
  readonly pid?: unknown
  readonly processNonce?: unknown
  readonly serverUrl: unknown
  readonly startedAt?: unknown
  readonly statePaths?: SecurityStatePaths
}

export async function startClusterMember(input: StartClusterMemberInput): Promise<ClusterMember> {
  const config = DispatchConfigSchema.parse(input.config ?? {})
  if (config.broker.port !== DEFAULT_BROKER_PORT) {
    throw new ClusterError("configuration_invalid")
  }
  const statePaths = input.statePaths ?? resolveCurrentSecurityStatePaths()
  const authorization =
    input.authorization === undefined
      ? undefined
      : BasicAuthorizationSchema.parse(input.authorization)
  const member = new ClusterMember({
    config,
    hostSecret: await initializeHostSecret(statePaths),
    pid: ProcessIdSchema.parse(input.pid ?? process.pid),
    processNonce: ProcessInstanceNonceSchema.parse(input.processNonce ?? randomUUID()),
    serverUrl: LoopbackServerUrlSchema.parse(input.serverUrl),
    startedAt: UnixEpochMsSchema.parse(input.startedAt ?? Date.now()),
    stateStore: new ClusterStateStore(statePaths),
    ...(authorization === undefined ? {} : { authorization }),
  })
  await member.start()
  return member
}
