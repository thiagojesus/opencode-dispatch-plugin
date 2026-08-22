import {
  MAX_TITLE_LENGTH,
  type PermissionRequest,
  PermissionRequestListSchema,
  type QuestionRequest,
  QuestionRequestListSchema,
  type SessionId,
  SessionIdSchema,
  type SessionStatus,
  SessionStatusSchema,
  type TodoItem,
  TodoListSchema,
  type UnixEpochMs,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"
import { z } from "zod"

import { ApiHttpError } from "./errors.ts"

const UpstreamSessionSchema = z.object({
  id: SessionIdSchema,
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  time: z.object({ updated: UnixEpochMsSchema }),
})
const UpstreamStatusSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("idle") }),
  z.object({ type: z.literal("busy") }),
  z.object({
    type: z.literal("retry"),
    attempt: z.number().int().nonnegative(),
    message: z.string(),
    next: UnixEpochMsSchema,
  }),
])
const UpstreamTodoSchema = z.object({
  content: z.string(),
  status: z.string(),
  priority: z.string(),
})
const UpstreamPermissionSchema = z.object({
  id: z.string(),
  sessionID: SessionIdSchema,
  action: z.string(),
  resources: z.array(z.string()),
  source: z
    .object({ type: z.literal("tool"), messageID: z.string(), callID: z.string() })
    .optional(),
})
const UpstreamQuestionSchema = z.object({
  id: z.string(),
  sessionID: SessionIdSchema,
  questions: z.array(
    z.object({
      header: z.string(),
      question: z.string(),
      options: z.array(z.object({ label: z.string(), description: z.string() })),
      multiple: z.boolean().optional(),
      custom: z.boolean().optional(),
    }),
  ),
})

export type NormalizedSession = {
  readonly id: SessionId
  readonly title: string
  readonly updatedAt: UnixEpochMs
}

function responseInvalid(): never {
  throw new ApiHttpError("UPSTREAM_UNAVAILABLE")
}

export function normalizeSession(value: unknown): NormalizedSession {
  const parsed = UpstreamSessionSchema.safeParse(value)
  if (!parsed.success) return responseInvalid()
  return { id: parsed.data.id, title: parsed.data.title, updatedAt: parsed.data.time.updated }
}

export function normalizeStatus(value: unknown): SessionStatus {
  const parsed = UpstreamStatusSchema.safeParse(value)
  if (!parsed.success) return responseInvalid()
  switch (parsed.data.type) {
    case "idle":
      return SessionStatusSchema.parse({ type: "idle" })
    case "busy":
      return SessionStatusSchema.parse({ type: "busy" })
    case "retry":
      return SessionStatusSchema.parse({
        type: "retry",
        attempt: parsed.data.attempt,
        message: parsed.data.message,
        nextRetryAt: parsed.data.next,
      })
  }
}

export function normalizeTodos(value: unknown): readonly TodoItem[] {
  const parsed = z.array(UpstreamTodoSchema).safeParse(value)
  if (!parsed.success) return responseInvalid()
  const output = TodoListSchema.safeParse(parsed.data)
  if (!output.success) return responseInvalid()
  return output.data
}

export function normalizePermissions(
  value: unknown,
  sessionId: SessionId,
): readonly PermissionRequest[] {
  const parsed = z.array(UpstreamPermissionSchema).safeParse(value)
  if (!parsed.success || parsed.data.some((item) => item.sessionID !== sessionId)) {
    return responseInvalid()
  }
  const output = PermissionRequestListSchema.safeParse(
    parsed.data.map((item) => ({
      id: item.id,
      action: item.action,
      resources: item.resources,
      ...(item.source === undefined
        ? {}
        : { source: { messageId: item.source.messageID, callId: item.source.callID } }),
    })),
  )
  if (!output.success) return responseInvalid()
  return output.data
}

export function normalizeQuestions(
  value: unknown,
  sessionId: SessionId,
): readonly QuestionRequest[] {
  const parsed = z.array(UpstreamQuestionSchema).safeParse(value)
  if (!parsed.success || parsed.data.some((item) => item.sessionID !== sessionId)) {
    return responseInvalid()
  }
  const output = QuestionRequestListSchema.safeParse(
    parsed.data.map((item) => ({
      id: item.id,
      questions: item.questions.map((question) => ({
        header: question.header,
        question: question.question,
        options: question.options,
        multiple: question.multiple ?? false,
        custom: question.custom ?? false,
      })),
    })),
  )
  if (!output.success) return responseInvalid()
  return output.data
}
