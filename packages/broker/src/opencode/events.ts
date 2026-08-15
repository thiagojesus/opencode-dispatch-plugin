import { SessionIdSchema, UnixEpochMsSchema } from "@opencode-dispatch/contracts"
import { z } from "zod"

export const OPEN_CODE_SESSION_EVENT_TYPES = [
  "session.created",
  "session.updated",
  "session.deleted",
  "message.updated",
  "message.removed",
  "message.part.updated",
  "message.part.removed",
  "permission.updated",
  "permission.replied",
  "permission.v2.asked",
  "permission.v2.replied",
  "question.asked",
  "question.replied",
  "question.rejected",
  "question.v2.asked",
  "question.v2.replied",
  "question.v2.rejected",
  "todo.updated",
  "session.status",
  "session.idle",
  "session.compacted",
  "session.diff",
  "session.error",
] as const

export const OpenCodeSessionSignalSchema = z
  .strictObject({
    eventType: z.enum(OPEN_CODE_SESSION_EVENT_TYPES),
    observedAt: UnixEpochMsSchema,
    sessionId: SessionIdSchema,
    source: z.enum(["seed", "live"]),
  })
  .readonly()
export type OpenCodeSessionSignal = z.infer<typeof OpenCodeSessionSignalSchema>

const EventEnvelopeSchema = z.object({ type: z.string(), properties: z.unknown() })
const DirectSessionSchema = z.object({ sessionID: SessionIdSchema })
const InfoSessionSchema = z.object({
  info: z.object({ id: SessionIdSchema.optional(), sessionID: SessionIdSchema.optional() }),
  sessionID: SessionIdSchema.optional(),
})
const PartSessionSchema = z.object({
  part: z.object({ sessionID: SessionIdSchema }),
  sessionID: SessionIdSchema.optional(),
})

function sessionFromInfo(
  properties: unknown,
): ReturnType<typeof SessionIdSchema.parse> | undefined {
  const parsed = InfoSessionSchema.safeParse(properties)
  if (!parsed.success) return undefined
  return parsed.data.sessionID ?? parsed.data.info.sessionID ?? parsed.data.info.id
}

function sessionFromPart(
  properties: unknown,
): ReturnType<typeof SessionIdSchema.parse> | undefined {
  const parsed = PartSessionSchema.safeParse(properties)
  if (!parsed.success) return undefined
  return parsed.data.sessionID ?? parsed.data.part.sessionID
}

function sessionDirect(properties: unknown): ReturnType<typeof SessionIdSchema.parse> | undefined {
  const parsed = DirectSessionSchema.safeParse(properties)
  return parsed.success ? parsed.data.sessionID : undefined
}

function signal(
  eventType: (typeof OPEN_CODE_SESSION_EVENT_TYPES)[number],
  sessionId: ReturnType<typeof SessionIdSchema.parse> | undefined,
  observedAt: unknown,
): OpenCodeSessionSignal | undefined {
  if (sessionId === undefined) return undefined
  return OpenCodeSessionSignalSchema.parse({ eventType, observedAt, sessionId, source: "live" })
}

export function parseOpenCodeSessionSignal(
  event: unknown,
  observedAt: unknown,
): OpenCodeSessionSignal | undefined {
  const parsed = EventEnvelopeSchema.safeParse(event)
  if (!parsed.success) return undefined
  const { properties, type } = parsed.data
  switch (type) {
    case "session.created":
    case "session.updated":
    case "session.deleted":
    case "message.updated":
      return signal(type, sessionFromInfo(properties), observedAt)
    case "message.part.updated":
      return signal(type, sessionFromPart(properties), observedAt)
    case "message.removed":
    case "message.part.removed":
    case "permission.updated":
    case "permission.replied":
    case "permission.v2.asked":
    case "permission.v2.replied":
    case "question.asked":
    case "question.replied":
    case "question.rejected":
    case "question.v2.asked":
    case "question.v2.replied":
    case "question.v2.rejected":
    case "todo.updated":
    case "session.status":
    case "session.idle":
    case "session.compacted":
    case "session.diff":
    case "session.error":
      return signal(type, sessionDirect(properties), observedAt)
    default:
      return undefined
  }
}

export function createOpenCodeStatusSeed(
  sessionId: unknown,
  observedAt: unknown,
): OpenCodeSessionSignal {
  return OpenCodeSessionSignalSchema.parse({
    eventType: "session.status",
    observedAt,
    sessionId,
    source: "seed",
  })
}
