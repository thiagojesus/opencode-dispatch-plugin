import { z } from "zod"

import { isWithinPublicPayloadLimit } from "./bounds.ts"
import { MAX_EVENT_BATCH_SIZE, PROTOCOL_VERSION } from "./constants.ts"
import { assertNever } from "./exhaustive.ts"
import {
  BrokerEpochSchema,
  MessageIdSchema,
  MonotonicSequenceSchema,
  PartIdSchema,
  PermissionRequestIdSchema,
  QuestionRequestIdSchema,
  SessionIdSchema,
  UnixEpochMsSchema,
} from "./ids.ts"
import {
  PermissionDecisionSchema,
  PermissionRequestSchema,
  QuestionRequestSchema,
} from "./pending.ts"
import { SessionSummarySchema } from "./session.ts"
import { SessionStatusSchema, TodoListSchema } from "./status.ts"
import { TimelineItemSchema } from "./timeline.ts"

const SessionUpdatedEventSchema = z.strictObject({
  type: z.literal("session.updated"),
  session: SessionSummarySchema,
})
const TimelineUpsertedEventSchema = z.strictObject({
  type: z.literal("timeline.upserted"),
  item: TimelineItemSchema,
})
const TimelineRemovedEventSchema = z.strictObject({
  type: z.literal("timeline.removed"),
  messageId: MessageIdSchema,
  partId: PartIdSchema.optional(),
})
const StatusUpdatedEventSchema = z.strictObject({
  type: z.literal("status.updated"),
  status: SessionStatusSchema,
})
const TodosUpdatedEventSchema = z.strictObject({
  type: z.literal("todos.updated"),
  todos: TodoListSchema,
})
const PermissionRequestedEventSchema = z.strictObject({
  type: z.literal("permission.requested"),
  permission: PermissionRequestSchema,
})
const PermissionResolvedEventSchema = z.strictObject({
  type: z.literal("permission.resolved"),
  requestId: PermissionRequestIdSchema,
  decision: PermissionDecisionSchema,
})
const QuestionRequestedEventSchema = z.strictObject({
  type: z.literal("question.requested"),
  question: QuestionRequestSchema,
})
const QuestionResolvedEventSchema = z.strictObject({
  type: z.literal("question.resolved"),
  requestId: QuestionRequestIdSchema,
})
const SessionRevokedEventSchema = z.strictObject({
  type: z.literal("session.revoked"),
  reason: z.enum(["disabled", "registration_expired", "process_exit", "ownership_lost"]),
})

export const NormalizedEventSchema = z
  .discriminatedUnion("type", [
    SessionUpdatedEventSchema,
    TimelineUpsertedEventSchema,
    TimelineRemovedEventSchema,
    StatusUpdatedEventSchema,
    TodosUpdatedEventSchema,
    PermissionRequestedEventSchema,
    PermissionResolvedEventSchema,
    QuestionRequestedEventSchema,
    QuestionResolvedEventSchema,
    SessionRevokedEventSchema,
  ])
  .readonly()
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>

const NormalizedEventEnvelopeObjectSchema = z.strictObject({
  type: z.literal("event"),
  version: z.literal(PROTOCOL_VERSION),
  brokerEpoch: BrokerEpochSchema,
  sequence: MonotonicSequenceSchema,
  emittedAt: UnixEpochMsSchema,
  sessionId: SessionIdSchema,
  event: NormalizedEventSchema,
})

export const NormalizedEventEnvelopeSchema = NormalizedEventEnvelopeObjectSchema.refine(
  isWithinPublicPayloadLimit,
  "Normalized event exceeds the 1 MiB public payload limit",
).readonly()
export type NormalizedEventEnvelope = z.infer<typeof NormalizedEventEnvelopeSchema>

export const NormalizedEventSequenceSchema = z
  .array(NormalizedEventEnvelopeSchema)
  .max(MAX_EVENT_BATCH_SIZE)
  .refine(
    isWithinPublicPayloadLimit,
    "Normalized event sequence exceeds the 1 MiB public payload limit",
  )
  .readonly()
export type NormalizedEventSequence = z.infer<typeof NormalizedEventSequenceSchema>

export function normalizedEventSessionId(
  envelope: NormalizedEventEnvelope,
): NormalizedEventEnvelope["sessionId"] {
  switch (envelope.event.type) {
    case "session.updated":
      return envelope.sessionId
    case "timeline.upserted":
      return envelope.sessionId
    case "timeline.removed":
      return envelope.sessionId
    case "status.updated":
      return envelope.sessionId
    case "todos.updated":
      return envelope.sessionId
    case "permission.requested":
      return envelope.sessionId
    case "permission.resolved":
      return envelope.sessionId
    case "question.requested":
      return envelope.sessionId
    case "question.resolved":
      return envelope.sessionId
    case "session.revoked":
      return envelope.sessionId
    default:
      return assertNever(envelope.event)
  }
}
