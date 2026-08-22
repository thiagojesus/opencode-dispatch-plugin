import { z } from "zod"

import {
  CONTROL_CAPABILITY,
  MAX_PAGE_SIZE,
  MAX_PROMPT_BYTES,
  MAX_PUBLIC_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
} from "./constants.ts"
import { TailscaleLoginSchema } from "./ids.ts"

export const TransportIdentitySchema = z
  .strictObject({
    login: TailscaleLoginSchema,
    capability: z.literal(CONTROL_CAPABILITY),
  })
  .readonly()
export type TransportIdentity = z.infer<typeof TransportIdentitySchema>

export const HealthResponseSchema = z
  .strictObject({
    type: z.literal("health"),
    version: z.literal(PROTOCOL_VERSION),
    status: z.literal("ok"),
  })
  .readonly()
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const CONTROL_ACTIONS = [
  "session_list",
  "session_snapshot",
  "session_status",
  "session_todos",
  "prompt",
  "abort",
  "permission_once",
  "permission_reject",
  "question_reply",
] as const

export const CapabilitiesResponseSchema = z
  .strictObject({
    type: z.literal("capabilities"),
    version: z.literal(PROTOCOL_VERSION),
    controlCapability: z.literal(CONTROL_CAPABILITY),
    actions: z
      .tuple([
        z.literal("session_list"),
        z.literal("session_snapshot"),
        z.literal("session_status"),
        z.literal("session_todos"),
        z.literal("prompt"),
        z.literal("abort"),
        z.literal("permission_once"),
        z.literal("permission_reject"),
        z.literal("question_reply"),
      ])
      .readonly(),
    maxPromptBytes: z.literal(MAX_PROMPT_BYTES),
    maxResponseBytes: z.literal(MAX_PUBLIC_PAYLOAD_BYTES),
    maxPageSize: z.literal(MAX_PAGE_SIZE),
  })
  .readonly()
export type CapabilitiesResponse = z.infer<typeof CapabilitiesResponseSchema>
