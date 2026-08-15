import {
  type BrokerEpoch,
  BrokerEpochSchema,
  IdempotencyKeySchema,
  PROTOCOL_VERSION,
  ProcessExposureSchema,
  ProcessInstanceNonceSchema,
  ProcessLifecycleMessageSchema,
  SessionIdSchema,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"
import { z } from "zod"
import { BasicAuthorizationSchema, OpenCodeSessionSignalSchema } from "../opencode/index.ts"
import { SECURITY_ERROR_CODES } from "../security/index.ts"
import { CLUSTER_ERROR_CODES } from "./errors.ts"

export const CLUSTER_SERVICE = "opencode-dispatch-plugin.cluster" as const
export const CLUSTER_HEALTH_PATH = "/.well-known/opencode-dispatch/cluster/health" as const
export const CLUSTER_MEMBER_PATH = "/.well-known/opencode-dispatch/cluster/member" as const

const ClusterFramePosition = {
  version: z.literal(PROTOCOL_VERSION),
  brokerEpoch: BrokerEpochSchema,
} as const
const InternalAuthChallengeSchema = z.strictObject({
  issuedAtMs: UnixEpochMsSchema,
  nonce: z
    .string()
    .length(22)
    .regex(/^[A-Za-z0-9_-]+$/u),
})
const InternalAuthResponseSchema = InternalAuthChallengeSchema.extend({
  signature: z
    .string()
    .length(43)
    .regex(/^[A-Za-z0-9_-]+$/u),
})

export const ClusterHealthSchema = z
  .strictObject({
    type: z.literal("cluster.health"),
    ...ClusterFramePosition,
    service: z.literal(CLUSTER_SERVICE),
  })
  .readonly()
export type ClusterHealth = z.infer<typeof ClusterHealthSchema>

const AuthResponseFrameSchema = z.strictObject({
  type: z.literal("auth.response"),
  ...ClusterFramePosition,
  response: InternalAuthResponseSchema,
})
const RegisterFrameSchema = z.strictObject({
  type: z.literal("member.register"),
  ...ClusterFramePosition,
  lifecycle: ProcessLifecycleMessageSchema,
  exposures: z.array(ProcessExposureSchema).max(256).readonly(),
  authorization: BasicAuthorizationSchema.optional(),
  signals: z.array(OpenCodeSessionSignalSchema).max(256).readonly().default([]),
})
const HeartbeatFrameSchema = z.strictObject({
  type: z.literal("member.heartbeat"),
  ...ClusterFramePosition,
  lifecycle: ProcessLifecycleMessageSchema,
})
const ExposureEnableFrameSchema = z.strictObject({
  type: z.literal("exposure.enable"),
  ...ClusterFramePosition,
  requestId: IdempotencyKeySchema,
  exposure: ProcessExposureSchema,
})
const ExposureDisableFrameSchema = z.strictObject({
  type: z.literal("exposure.disable"),
  ...ClusterFramePosition,
  requestId: IdempotencyKeySchema,
  processNonce: ProcessInstanceNonceSchema,
  sessionId: SessionIdSchema,
  sentAt: UnixEpochMsSchema,
})
const UnregisterFrameSchema = z.strictObject({
  type: z.literal("member.unregister"),
  ...ClusterFramePosition,
  requestId: IdempotencyKeySchema,
  lifecycle: ProcessLifecycleMessageSchema,
})
const OpenCodeEventFrameSchema = z.strictObject({
  type: z.literal("opencode.event"),
  ...ClusterFramePosition,
  requestId: IdempotencyKeySchema,
  processNonce: ProcessInstanceNonceSchema,
  signal: OpenCodeSessionSignalSchema,
})

export const ClusterClientFrameSchema = z
  .discriminatedUnion("type", [
    AuthResponseFrameSchema,
    RegisterFrameSchema,
    HeartbeatFrameSchema,
    ExposureEnableFrameSchema,
    ExposureDisableFrameSchema,
    OpenCodeEventFrameSchema,
    UnregisterFrameSchema,
  ])
  .readonly()
export type ClusterClientFrame = z.infer<typeof ClusterClientFrameSchema>

const AuthChallengeFrameSchema = z.strictObject({
  type: z.literal("auth.challenge"),
  ...ClusterFramePosition,
  challenge: InternalAuthChallengeSchema,
})
const AuthAcceptedFrameSchema = z.strictObject({
  type: z.literal("auth.accepted"),
  ...ClusterFramePosition,
})
const RegisteredFrameSchema = z.strictObject({
  type: z.literal("member.registered"),
  ...ClusterFramePosition,
})
const AcknowledgedFrameSchema = z.strictObject({
  type: z.literal("acknowledged"),
  ...ClusterFramePosition,
  requestId: IdempotencyKeySchema,
})
const CLUSTER_WIRE_ERROR_CODES = [...CLUSTER_ERROR_CODES, ...SECURITY_ERROR_CODES] as const
const ErrorFrameSchema = z.strictObject({
  type: z.literal("error"),
  ...ClusterFramePosition,
  code: z.enum(CLUSTER_WIRE_ERROR_CODES),
  requestId: IdempotencyKeySchema.optional(),
})

export const ClusterServerFrameSchema = z
  .discriminatedUnion("type", [
    AuthChallengeFrameSchema,
    AuthAcceptedFrameSchema,
    RegisteredFrameSchema,
    AcknowledgedFrameSchema,
    ErrorFrameSchema,
  ])
  .readonly()
export type ClusterServerFrame = z.infer<typeof ClusterServerFrameSchema>

export function clusterAuthBinding(brokerEpoch: BrokerEpoch): string {
  return `cluster.member:v${PROTOCOL_VERSION}:${brokerEpoch}`
}

export function clusterWebSocketUrl(): string {
  return `ws://127.0.0.1:43110${CLUSTER_MEMBER_PATH}`
}
