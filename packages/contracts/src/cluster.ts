import { z } from "zod"

import { MAX_TITLE_LENGTH, PROTOCOL_VERSION } from "./constants.ts"
import { assertNever } from "./exhaustive.ts"
import {
  LoopbackServerUrlSchema,
  ProcessIdSchema,
  ProcessInstanceNonceSchema,
  SessionIdSchema,
  UnixEpochMsSchema,
} from "./ids.ts"

const ProcessRegistrationSchema = z.strictObject({
  type: z.literal("process.register"),
  version: z.literal(PROTOCOL_VERSION),
  processNonce: ProcessInstanceNonceSchema,
  serverUrl: LoopbackServerUrlSchema,
  pid: ProcessIdSchema,
  startedAt: UnixEpochMsSchema,
})
const ProcessHeartbeatSchema = z.strictObject({
  type: z.literal("process.heartbeat"),
  version: z.literal(PROTOCOL_VERSION),
  processNonce: ProcessInstanceNonceSchema,
  sentAt: UnixEpochMsSchema,
})
const ProcessUnregisterSchema = z.strictObject({
  type: z.literal("process.unregister"),
  version: z.literal(PROTOCOL_VERSION),
  processNonce: ProcessInstanceNonceSchema,
  sentAt: UnixEpochMsSchema,
  reason: z.enum(["dispose", "process_exit", "shutdown"]),
})

export const ProcessLifecycleMessageSchema = z
  .discriminatedUnion("type", [
    ProcessRegistrationSchema,
    ProcessHeartbeatSchema,
    ProcessUnregisterSchema,
  ])
  .readonly()
export type ProcessLifecycleMessage = z.infer<typeof ProcessLifecycleMessageSchema>

export const ProcessExposureSchema = z
  .strictObject({
    version: z.literal(PROTOCOL_VERSION),
    sessionId: SessionIdSchema,
    processNonce: ProcessInstanceNonceSchema,
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
    enabledAt: UnixEpochMsSchema,
  })
  .readonly()
export type ProcessExposure = z.infer<typeof ProcessExposureSchema>

export function processNonceForLifecycleMessage(
  message: ProcessLifecycleMessage,
): ProcessLifecycleMessage["processNonce"] {
  switch (message.type) {
    case "process.register":
      return message.processNonce
    case "process.heartbeat":
      return message.processNonce
    case "process.unregister":
      return message.processNonce
    default:
      return assertNever(message)
  }
}
