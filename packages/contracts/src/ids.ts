import { z } from "zod"

import { MAX_CURSOR_LENGTH, MAX_ID_LENGTH } from "./constants.ts"

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u
const OpaqueIdSchema = z.string().min(1).max(MAX_ID_LENGTH).regex(OPAQUE_ID_PATTERN)

export const SessionIdSchema = OpaqueIdSchema.brand<"SessionId">()
export type SessionId = z.infer<typeof SessionIdSchema>

export const MessageIdSchema = OpaqueIdSchema.brand<"MessageId">()
export type MessageId = z.infer<typeof MessageIdSchema>

export const PartIdSchema = OpaqueIdSchema.brand<"PartId">()
export type PartId = z.infer<typeof PartIdSchema>

export const CallIdSchema = OpaqueIdSchema.brand<"CallId">()
export type CallId = z.infer<typeof CallIdSchema>

export const PermissionRequestIdSchema = OpaqueIdSchema.brand<"PermissionRequestId">()
export type PermissionRequestId = z.infer<typeof PermissionRequestIdSchema>

export const QuestionRequestIdSchema = OpaqueIdSchema.brand<"QuestionRequestId">()
export type QuestionRequestId = z.infer<typeof QuestionRequestIdSchema>

export const ProcessInstanceNonceSchema = z.uuid().brand<"ProcessInstanceNonce">()
export type ProcessInstanceNonce = z.infer<typeof ProcessInstanceNonceSchema>

export const BrokerEpochSchema = z.uuid().brand<"BrokerEpoch">()
export type BrokerEpoch = z.infer<typeof BrokerEpochSchema>

export const IdempotencyKeySchema = z.uuid().brand<"IdempotencyKey">()
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>

export const MonotonicSequenceSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .brand<"MonotonicSequence">()
export type MonotonicSequence = z.infer<typeof MonotonicSequenceSchema>

export const UnixEpochMsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .brand<"UnixEpochMs">()
export type UnixEpochMs = z.infer<typeof UnixEpochMsSchema>

export const ProcessIdSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .brand<"ProcessId">()
export type ProcessId = z.infer<typeof ProcessIdSchema>

export const PaginationCursorSchema = z
  .string()
  .min(1)
  .max(MAX_CURSOR_LENGTH)
  .brand<"PaginationCursor">()
export type PaginationCursor = z.infer<typeof PaginationCursorSchema>

export const TailscaleLoginSchema = z.email().max(320).brand<"TailscaleLogin">()
export type TailscaleLogin = z.infer<typeof TailscaleLoginSchema>

export const LoopbackServerUrlSchema = z
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) {
      return false
    }

    const url = new URL(value)
    const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]"
    const isHttp = url.protocol === "http:" || url.protocol === "https:"
    const hasCredentials = url.username.length > 0 || url.password.length > 0
    return isLoopback && isHttp && !hasCredentials && url.search === "" && url.hash === ""
  }, "Expected an HTTP(S) loopback URL without credentials, query, or fragment")
  .brand<"LoopbackServerUrl">()
export type LoopbackServerUrl = z.infer<typeof LoopbackServerUrlSchema>
