import {
  type ProcessInstanceNonce,
  type ProcessLifecycleMessage,
  ProcessLifecycleMessageSchema,
} from "@opencode-dispatch/contracts"

import { ClusterError } from "./errors.ts"

type UnregisterMessage = Extract<ProcessLifecycleMessage, { readonly type: "process.unregister" }>

export function createUnregisterMessage(processNonce: ProcessInstanceNonce): UnregisterMessage {
  const message = ProcessLifecycleMessageSchema.parse({
    type: "process.unregister",
    version: 1,
    processNonce,
    sentAt: Date.now(),
    reason: "dispose",
  })
  if (message.type !== "process.unregister") {
    throw new ClusterError("internal_failure")
  }
  return message
}
