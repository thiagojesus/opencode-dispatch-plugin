import { z } from "zod"

import { RemoteActionResponseSchema } from "./actions.ts"
import { isWithinPublicPayloadLimit } from "./bounds.ts"
import { PublicErrorEnvelopeSchema } from "./errors.ts"
import {
  SessionListResponseSchema,
  SessionPendingActionsResponseSchema,
  SessionSnapshotSchema,
  SessionStatusResponseSchema,
  SessionTodosResponseSchema,
} from "./session.ts"
import { CapabilitiesResponseSchema } from "./transport.ts"

const PublicResponseUnionSchema = z.union([
  CapabilitiesResponseSchema,
  SessionListResponseSchema,
  SessionSnapshotSchema,
  SessionStatusResponseSchema,
  SessionTodosResponseSchema,
  SessionPendingActionsResponseSchema,
  RemoteActionResponseSchema,
  PublicErrorEnvelopeSchema,
])

export const PublicResponseSchema = PublicResponseUnionSchema.refine(
  isWithinPublicPayloadLimit,
  "Public response exceeds the 1 MiB payload limit",
).readonly()
export type PublicResponse = z.infer<typeof PublicResponseSchema>
