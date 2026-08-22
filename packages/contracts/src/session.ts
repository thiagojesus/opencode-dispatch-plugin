import { z } from "zod"

import { isWithinPublicPayloadLimit } from "./bounds.ts"
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_PENDING_ACTIONS,
  MAX_TIMELINE_ITEMS,
  MAX_TITLE_LENGTH,
  PROTOCOL_VERSION,
} from "./constants.ts"
import {
  BrokerEpochSchema,
  MonotonicSequenceSchema,
  PaginationCursorSchema,
  SessionIdSchema,
  UnixEpochMsSchema,
} from "./ids.ts"
import { PermissionRequestListSchema, QuestionRequestListSchema } from "./pending.ts"
import { SessionStatusSchema, TodoListSchema } from "./status.ts"
import { TimelineItemSchema } from "./timeline.ts"

export const PaginationRequestSchema = z
  .strictObject({
    cursor: PaginationCursorSchema.optional(),
    limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .readonly()
export type PaginationRequest = z.infer<typeof PaginationRequestSchema>

export const SessionSummarySchema = z
  .strictObject({
    id: SessionIdSchema,
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
    status: SessionStatusSchema,
    enabledAt: UnixEpochMsSchema,
    updatedAt: UnixEpochMsSchema,
    pendingPermissionCount: z.number().int().nonnegative().max(MAX_PENDING_ACTIONS),
    pendingQuestionCount: z.number().int().nonnegative().max(MAX_PENDING_ACTIONS),
  })
  .readonly()
export type SessionSummary = z.infer<typeof SessionSummarySchema>

const SessionListResponseObjectSchema = z.strictObject({
  type: z.literal("session_list"),
  version: z.literal(PROTOCOL_VERSION),
  brokerEpoch: BrokerEpochSchema,
  sequence: MonotonicSequenceSchema,
  sessions: z.array(SessionSummarySchema).max(MAX_PAGE_SIZE).readonly(),
  nextCursor: PaginationCursorSchema.optional(),
})

export const SessionListResponseSchema = SessionListResponseObjectSchema.refine(
  isWithinPublicPayloadLimit,
  "Session list response exceeds the 1 MiB public payload limit",
).readonly()
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>

const SessionSnapshotObjectSchema = z.strictObject({
  type: z.literal("session_snapshot"),
  version: z.literal(PROTOCOL_VERSION),
  brokerEpoch: BrokerEpochSchema,
  sequence: MonotonicSequenceSchema,
  session: SessionSummarySchema,
  timeline: z.array(TimelineItemSchema).max(MAX_TIMELINE_ITEMS).readonly(),
  todos: TodoListSchema,
  pendingPermissions: PermissionRequestListSchema,
  pendingQuestions: QuestionRequestListSchema,
})

export const SessionSnapshotSchema = SessionSnapshotObjectSchema.refine(
  isWithinPublicPayloadLimit,
  "Session snapshot exceeds the 1 MiB public payload limit",
).readonly()
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>

const SessionMessagesResponseObjectSchema = z.strictObject({
  type: z.literal("session_messages"),
  version: z.literal(PROTOCOL_VERSION),
  brokerEpoch: BrokerEpochSchema,
  sequence: MonotonicSequenceSchema,
  sessionId: SessionIdSchema,
  timeline: z.array(TimelineItemSchema).max(MAX_TIMELINE_ITEMS).readonly(),
  nextCursor: PaginationCursorSchema.optional(),
})

export const SessionMessagesResponseSchema = SessionMessagesResponseObjectSchema.refine(
  isWithinPublicPayloadLimit,
  "Session messages response exceeds the 1 MiB public payload limit",
).readonly()
export type SessionMessagesResponse = z.infer<typeof SessionMessagesResponseSchema>

const SessionPositionShape = {
  version: z.literal(PROTOCOL_VERSION),
  brokerEpoch: BrokerEpochSchema,
  sequence: MonotonicSequenceSchema,
  sessionId: SessionIdSchema,
} as const

const SessionStatusResponseObjectSchema = z.strictObject({
  type: z.literal("session_status"),
  ...SessionPositionShape,
  status: SessionStatusSchema,
})
export const SessionStatusResponseSchema = SessionStatusResponseObjectSchema.refine(
  isWithinPublicPayloadLimit,
  "Session status response exceeds the 1 MiB public payload limit",
).readonly()
export type SessionStatusResponse = z.infer<typeof SessionStatusResponseSchema>

const SessionTodosResponseObjectSchema = z.strictObject({
  type: z.literal("session_todos"),
  ...SessionPositionShape,
  todos: TodoListSchema,
})
export const SessionTodosResponseSchema = SessionTodosResponseObjectSchema.refine(
  isWithinPublicPayloadLimit,
  "Session todo response exceeds the 1 MiB public payload limit",
).readonly()
export type SessionTodosResponse = z.infer<typeof SessionTodosResponseSchema>

const SessionPendingActionsResponseObjectSchema = z.strictObject({
  type: z.literal("session_pending_actions"),
  ...SessionPositionShape,
  pendingPermissions: PermissionRequestListSchema,
  pendingQuestions: QuestionRequestListSchema,
})
export const SessionPendingActionsResponseSchema = SessionPendingActionsResponseObjectSchema.refine(
  isWithinPublicPayloadLimit,
  "Session pending-actions response exceeds the 1 MiB public payload limit",
).readonly()
export type SessionPendingActionsResponse = z.infer<typeof SessionPendingActionsResponseSchema>
