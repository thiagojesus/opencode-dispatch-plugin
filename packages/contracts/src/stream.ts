import { z } from "zod"

import { isWithinPublicPayloadLimit } from "./bounds.ts"
import { PROTOCOL_VERSION } from "./constants.ts"
import { NormalizedEventEnvelopeSchema, NormalizedEventSequenceSchema } from "./events.ts"
import { BrokerEpochSchema, MonotonicSequenceSchema, SessionIdSchema } from "./ids.ts"

export const EventStreamScopeSchema = z
  .discriminatedUnion("type", [
    z.strictObject({ type: z.literal("sessions") }),
    z.strictObject({ type: z.literal("session"), sessionId: SessionIdSchema }),
  ])
  .readonly()
export type EventStreamScope = z.infer<typeof EventStreamScopeSchema>

export const EventStreamSubscribeSchema = z
  .strictObject({
    type: z.literal("subscribe"),
    version: z.literal(PROTOCOL_VERSION),
    brokerEpoch: BrokerEpochSchema,
    sequence: MonotonicSequenceSchema,
    scope: EventStreamScopeSchema,
  })
  .readonly()
export type EventStreamSubscribe = z.infer<typeof EventStreamSubscribeSchema>

export const EventStreamClientFrameSchema = EventStreamSubscribeSchema
export type EventStreamClientFrame = z.infer<typeof EventStreamClientFrameSchema>

const EventStreamReadySchema = z.strictObject({
  type: z.literal("ready"),
  version: z.literal(PROTOCOL_VERSION),
  brokerEpoch: BrokerEpochSchema,
  sequence: MonotonicSequenceSchema,
})

const EventStreamReplaySchema = z.strictObject({
  type: z.literal("replay"),
  version: z.literal(PROTOCOL_VERSION),
  brokerEpoch: BrokerEpochSchema,
  sequence: MonotonicSequenceSchema,
  events: NormalizedEventSequenceSchema,
})

const EventStreamResyncSchema = z.strictObject({
  type: z.literal("resync"),
  version: z.literal(PROTOCOL_VERSION),
  brokerEpoch: BrokerEpochSchema,
  sequence: MonotonicSequenceSchema,
  reason: z.enum(["epoch_changed", "sequence_gap", "replay_unavailable"]),
})

export const EventStreamServerFrameSchema = z
  .union([
    EventStreamReadySchema,
    EventStreamReplaySchema,
    EventStreamResyncSchema,
    NormalizedEventEnvelopeSchema,
  ])
  .refine(isWithinPublicPayloadLimit, "Event stream frame exceeds the 1 MiB payload limit")
  .readonly()
export type EventStreamServerFrame = z.infer<typeof EventStreamServerFrameSchema>
