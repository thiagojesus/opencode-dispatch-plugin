import {
  assertNever,
  CallIdSchema,
  MessageIdSchema,
  PartIdSchema,
  SessionIdSchema,
  type TimelineItem,
  TimelineItemSchema,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"
import { z } from "zod"

import { ApiHttpError } from "./errors.ts"

const MessageInfoSchema = z.object({
  id: MessageIdSchema,
  sessionID: SessionIdSchema,
  role: z.enum(["user", "assistant"]),
  time: z.object({ created: UnixEpochMsSchema, completed: UnixEpochMsSchema.optional() }),
})
const MessageEnvelopeSchema = z.object({
  info: MessageInfoSchema,
  parts: z.array(z.unknown()),
})
const TextPartSchema = z.object({
  id: PartIdSchema,
  sessionID: SessionIdSchema,
  messageID: MessageIdSchema,
  type: z.literal("text"),
  text: z.string(),
  time: z.object({ end: UnixEpochMsSchema.optional() }).optional(),
})
const ReasoningPartSchema = z.object({
  id: PartIdSchema,
  sessionID: SessionIdSchema,
  messageID: MessageIdSchema,
  type: z.literal("reasoning"),
  text: z.string(),
  time: z.object({ start: UnixEpochMsSchema, end: UnixEpochMsSchema.optional() }),
})
const ToolPartSchema = z.object({
  id: PartIdSchema,
  sessionID: SessionIdSchema,
  messageID: MessageIdSchema,
  type: z.literal("tool"),
  callID: CallIdSchema,
  tool: z.string(),
  state: z.discriminatedUnion("status", [
    z.object({ status: z.literal("pending") }),
    z.object({ status: z.literal("running"), title: z.string().optional() }),
    z.object({ status: z.literal("completed"), title: z.string(), output: z.string() }),
    z.object({ status: z.literal("error"), error: z.string() }),
  ]),
})

function normalizeAssistantPart(value: unknown): TimelineItem | undefined {
  const text = TextPartSchema.safeParse(value)
  if (text.success) {
    return TimelineItemSchema.parse({
      type: "assistant_text",
      messageId: text.data.messageID,
      partId: text.data.id,
      text: text.data.text,
      phase: text.data.time?.end === undefined ? "streaming" : "complete",
    })
  }
  const reasoning = ReasoningPartSchema.safeParse(value)
  if (reasoning.success) {
    return TimelineItemSchema.parse({
      type: "assistant_reasoning",
      messageId: reasoning.data.messageID,
      partId: reasoning.data.id,
      text: reasoning.data.text,
      phase: reasoning.data.time.end === undefined ? "streaming" : "complete",
    })
  }
  const tool = ToolPartSchema.safeParse(value)
  if (!tool.success) return undefined
  const state = tool.data.state
  let normalizedState: Readonly<Record<string, unknown>>
  switch (state.status) {
    case "pending":
      normalizedState = { status: "pending" }
      break
    case "running":
      normalizedState = {
        status: "running",
        ...(state.title === undefined ? {} : { title: state.title }),
      }
      break
    case "completed":
      normalizedState = { status: "completed", title: state.title, output: state.output }
      break
    case "error":
      normalizedState = { status: "error", message: state.error }
      break
    default:
      return assertNever(state)
  }
  return TimelineItemSchema.parse({
    type: "tool",
    messageId: tool.data.messageID,
    partId: tool.data.id,
    callId: tool.data.callID,
    name: tool.data.tool,
    state: normalizedState,
  })
}

export function normalizeTimeline(value: unknown): readonly TimelineItem[] {
  const parsed = z.array(MessageEnvelopeSchema).safeParse(value)
  if (!parsed.success) throw new ApiHttpError("UPSTREAM_UNAVAILABLE")
  const timeline: TimelineItem[] = []
  for (const message of parsed.data) {
    if (message.info.role === "user") {
      const textParts: string[] = []
      for (const part of message.parts) {
        const parsedPart = TextPartSchema.safeParse(part)
        if (parsedPart.success && parsedPart.data.messageID === message.info.id) {
          textParts.push(parsedPart.data.text)
        }
      }
      const text = textParts.join("\n")
      if (text.length > 0) {
        timeline.push(
          TimelineItemSchema.parse({
            type: "user_message",
            messageId: message.info.id,
            text,
            createdAt: message.info.time.created,
          }),
        )
      }
      continue
    }
    for (const part of message.parts) {
      const item = normalizeAssistantPart(part)
      if (item !== undefined && item.messageId === message.info.id) timeline.push(item)
    }
  }
  return timeline
}
