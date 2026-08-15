import { join } from "node:path"

import { DispatchConfigSchema } from "@opencode-dispatch/contracts"
import { z } from "zod"

import type { SecurityStatePaths } from "../security/index.ts"
import { startClusterMember } from "./index.ts"

const WorkerEnvironmentSchema = z.strictObject({
  memberId: z.string().regex(/^member-[1-9][0-9]*$/u),
  reportedPid: z.number().int().positive(),
  serverPort: z.number().int().min(1).max(65_535),
  stateDirectory: z.string().min(1),
})
const WorkerCommandSchema = z.strictObject({
  type: z.literal("enable"),
  requestId: z.string().uuid(),
  sessionId: z.string().min(1),
  title: z.string().min(1),
})
const config = DispatchConfigSchema.parse({
  registration: { heartbeatIntervalMs: 100, ttlMs: 1_000 },
  reconnect: { initialDelayMs: 10, maxDelayMs: 100, maxAttempts: 16 },
})
const environment = WorkerEnvironmentSchema.parse({
  memberId: process.env["DISPATCH_MEMBER_ID"],
  reportedPid: Number(process.env["DISPATCH_REPORTED_PID"]),
  serverPort: Number(process.env["DISPATCH_SERVER_PORT"]),
  stateDirectory: process.env["DISPATCH_STATE_DIRECTORY"],
})
const paths: SecurityStatePaths = {
  modePolicy: process.platform === "win32" ? "windows_user_local" : "posix",
  stateDirectory: environment.stateDirectory,
  hostSecretFile: join(environment.stateDirectory, "host-secret"),
}
const member = await startClusterMember({
  config,
  pid: environment.reportedPid,
  serverUrl: `http://127.0.0.1:${environment.serverPort}`,
  statePaths: paths,
})

member.subscribe((status) => {
  process.send?.({
    type: "status",
    memberId: environment.memberId,
    role: status.role,
    connected: status.connected,
    brokerEpoch: status.brokerEpoch,
    processNonce: status.processNonce,
    exposureSessionIds:
      status.leaderSnapshot?.exposures.map((exposure) => exposure.sessionId) ?? [],
  })
})

process.on("message", async (value: unknown) => {
  const command = WorkerCommandSchema.safeParse(value)
  if (!command.success) {
    return
  }
  await member.enableExposure({
    enabledAt: Date.now(),
    sessionId: command.data.sessionId,
    title: command.data.title,
  })
  process.send?.({ type: "enabled", requestId: command.data.requestId })
})

const stop = (): void => {
  void member.dispose().then(() => process.exit(0))
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
