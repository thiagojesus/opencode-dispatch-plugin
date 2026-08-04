import { z } from "zod"

import { isWithinPublicPayloadLimit, utf8ByteLength } from "./bounds.ts"
import { MAX_PROMPT_BYTES, PROTOCOL_VERSION } from "./constants.ts"
import { assertNever } from "./exhaustive.ts"
import {
  IdempotencyKeySchema,
  PermissionRequestIdSchema,
  QuestionRequestIdSchema,
  SessionIdSchema,
  UnixEpochMsSchema,
} from "./ids.ts"
import { PermissionDecisionSchema, QuestionReplyAnswersSchema } from "./pending.ts"

export const PromptTextSchema = z
  .string()
  .min(1)
  .max(MAX_PROMPT_BYTES)
  .refine(
    (value) => utf8ByteLength(value) <= MAX_PROMPT_BYTES,
    "Prompt exceeds the 32 KiB UTF-8 limit",
  )
  .brand<"PromptText">()
export type PromptText = z.infer<typeof PromptTextSchema>

export const PromptRequestSchema = z.strictObject({
  type: z.literal("prompt"),
  version: z.literal(PROTOCOL_VERSION),
  sessionId: SessionIdSchema,
  idempotencyKey: IdempotencyKeySchema,
  text: PromptTextSchema,
})
export const AbortRequestSchema = z.strictObject({
  type: z.literal("abort"),
  version: z.literal(PROTOCOL_VERSION),
  sessionId: SessionIdSchema,
})
export const PermissionReplyRequestSchema = z.strictObject({
  type: z.literal("permission_reply"),
  version: z.literal(PROTOCOL_VERSION),
  sessionId: SessionIdSchema,
  requestId: PermissionRequestIdSchema,
  decision: PermissionDecisionSchema,
})
export const QuestionReplyRequestSchema = z.strictObject({
  type: z.literal("question_reply"),
  version: z.literal(PROTOCOL_VERSION),
  sessionId: SessionIdSchema,
  requestId: QuestionRequestIdSchema,
  answers: QuestionReplyAnswersSchema,
})

export const RemoteActionRequestSchema = z
  .discriminatedUnion("type", [
    PromptRequestSchema,
    AbortRequestSchema,
    PermissionReplyRequestSchema,
    QuestionReplyRequestSchema,
  ])
  .readonly()
export type RemoteActionRequest = z.infer<typeof RemoteActionRequestSchema>

const PromptAcceptedResponseSchema = z.strictObject({
  type: z.literal("prompt_accepted"),
  version: z.literal(PROTOCOL_VERSION),
  sessionId: SessionIdSchema,
  idempotencyKey: IdempotencyKeySchema,
  acceptedAt: UnixEpochMsSchema,
  duplicate: z.boolean(),
})
const AbortAcceptedResponseSchema = z.strictObject({
  type: z.literal("abort_accepted"),
  version: z.literal(PROTOCOL_VERSION),
  sessionId: SessionIdSchema,
  acceptedAt: UnixEpochMsSchema,
})
const PermissionReplyAcceptedResponseSchema = z.strictObject({
  type: z.literal("permission_reply_accepted"),
  version: z.literal(PROTOCOL_VERSION),
  sessionId: SessionIdSchema,
  requestId: PermissionRequestIdSchema,
  decision: PermissionDecisionSchema,
})
const QuestionReplyAcceptedResponseSchema = z.strictObject({
  type: z.literal("question_reply_accepted"),
  version: z.literal(PROTOCOL_VERSION),
  sessionId: SessionIdSchema,
  requestId: QuestionRequestIdSchema,
})

const RemoteActionResponseUnionSchema = z.discriminatedUnion("type", [
  PromptAcceptedResponseSchema,
  AbortAcceptedResponseSchema,
  PermissionReplyAcceptedResponseSchema,
  QuestionReplyAcceptedResponseSchema,
])
export const RemoteActionResponseSchema = RemoteActionResponseUnionSchema.refine(
  isWithinPublicPayloadLimit,
  "Action response exceeds the 1 MiB public payload limit",
).readonly()
export type RemoteActionResponse = z.infer<typeof RemoteActionResponseSchema>

export function remoteActionSessionId(
  action: RemoteActionRequest,
): RemoteActionRequest["sessionId"] {
  switch (action.type) {
    case "prompt":
      return action.sessionId
    case "abort":
      return action.sessionId
    case "permission_reply":
      return action.sessionId
    case "question_reply":
      return action.sessionId
    default:
      return assertNever(action)
  }
}
