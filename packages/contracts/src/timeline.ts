import { z } from "zod"

import { MAX_PUBLIC_PAYLOAD_BYTES, MAX_SHORT_TEXT_LENGTH } from "./constants.ts"
import { CallIdSchema, MessageIdSchema, PartIdSchema, UnixEpochMsSchema } from "./ids.ts"

const TimelineTextSchema = z.string().max(MAX_PUBLIC_PAYLOAD_BYTES)
const TimelinePhaseSchema = z.enum(["streaming", "complete"])

const UserMessageSchema = z.strictObject({
  type: z.literal("user_message"),
  messageId: MessageIdSchema,
  text: TimelineTextSchema,
  createdAt: UnixEpochMsSchema,
})
const AssistantTextSchema = z.strictObject({
  type: z.literal("assistant_text"),
  messageId: MessageIdSchema,
  partId: PartIdSchema,
  text: TimelineTextSchema,
  phase: TimelinePhaseSchema,
})
const AssistantReasoningSchema = z.strictObject({
  type: z.literal("assistant_reasoning"),
  messageId: MessageIdSchema,
  partId: PartIdSchema,
  text: TimelineTextSchema,
  phase: TimelinePhaseSchema,
})

const PendingToolStateSchema = z.strictObject({ status: z.literal("pending") })
const RunningToolStateSchema = z.strictObject({
  status: z.literal("running"),
  title: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH).optional(),
})
const CompletedToolStateSchema = z.strictObject({
  status: z.literal("completed"),
  title: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH),
  output: TimelineTextSchema,
})
const FailedToolStateSchema = z.strictObject({
  status: z.literal("error"),
  message: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH),
})

export const ToolStateSchema = z
  .discriminatedUnion("status", [
    PendingToolStateSchema,
    RunningToolStateSchema,
    CompletedToolStateSchema,
    FailedToolStateSchema,
  ])
  .readonly()
export type ToolState = z.infer<typeof ToolStateSchema>

const ToolTimelineItemSchema = z.strictObject({
  type: z.literal("tool"),
  messageId: MessageIdSchema,
  partId: PartIdSchema,
  callId: CallIdSchema,
  name: z.string().trim().min(1).max(128),
  state: ToolStateSchema,
})

export const TimelineItemSchema = z
  .discriminatedUnion("type", [
    UserMessageSchema,
    AssistantTextSchema,
    AssistantReasoningSchema,
    ToolTimelineItemSchema,
  ])
  .readonly()
export type TimelineItem = z.infer<typeof TimelineItemSchema>
