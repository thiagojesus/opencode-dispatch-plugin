import { z } from "zod"

import {
  DEFAULT_BROKER_HOST,
  DEFAULT_BROKER_PORT,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_RECONNECT_INITIAL_DELAY_MS,
  DEFAULT_RECONNECT_MAX_ATTEMPTS,
  DEFAULT_RECONNECT_MAX_DELAY_MS,
  DEFAULT_REGISTRATION_TTL_MS,
  MAX_PAGE_SIZE,
  PROTOCOL_VERSION,
} from "./constants.ts"

const DEFAULT_BROKER = Object.freeze({
  host: DEFAULT_BROKER_HOST,
  port: DEFAULT_BROKER_PORT,
} as const)
const DEFAULT_REGISTRATION = Object.freeze({
  heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
  ttlMs: DEFAULT_REGISTRATION_TTL_MS,
} as const)
const DEFAULT_RECONNECT = Object.freeze({
  initialDelayMs: DEFAULT_RECONNECT_INITIAL_DELAY_MS,
  maxDelayMs: DEFAULT_RECONNECT_MAX_DELAY_MS,
  maxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS,
} as const)
const DEFAULT_PAGINATION = Object.freeze({
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxPageSize: MAX_PAGE_SIZE,
} as const)

const MillisecondsSchema = z.number().int().positive().max(300_000)
const BrokerConfigSchema = z
  .strictObject({
    host: z.literal(DEFAULT_BROKER_HOST).default(DEFAULT_BROKER_HOST),
    port: z.number().int().min(1).max(65_535).default(DEFAULT_BROKER_PORT),
  })
  .readonly()
const RegistrationConfigSchema = z
  .strictObject({
    heartbeatIntervalMs: MillisecondsSchema.default(DEFAULT_HEARTBEAT_INTERVAL_MS),
    ttlMs: MillisecondsSchema.default(DEFAULT_REGISTRATION_TTL_MS),
  })
  .readonly()
const ReconnectConfigSchema = z
  .strictObject({
    initialDelayMs: MillisecondsSchema.default(DEFAULT_RECONNECT_INITIAL_DELAY_MS),
    maxDelayMs: MillisecondsSchema.default(DEFAULT_RECONNECT_MAX_DELAY_MS),
    maxAttempts: z.number().int().min(1).max(32).default(DEFAULT_RECONNECT_MAX_ATTEMPTS),
  })
  .readonly()
const PaginationConfigSchema = z
  .strictObject({
    defaultPageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    maxPageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(MAX_PAGE_SIZE),
  })
  .readonly()

export const DispatchConfigSchema = z
  .strictObject({
    version: z.literal(PROTOCOL_VERSION).default(PROTOCOL_VERSION),
    broker: BrokerConfigSchema.default(DEFAULT_BROKER),
    registration: RegistrationConfigSchema.default(DEFAULT_REGISTRATION),
    reconnect: ReconnectConfigSchema.default(DEFAULT_RECONNECT),
    pagination: PaginationConfigSchema.default(DEFAULT_PAGINATION),
  })
  .refine((config) => config.registration.ttlMs >= config.registration.heartbeatIntervalMs * 2, {
    path: ["registration", "ttlMs"],
    message: "Registration TTL must cover at least two heartbeat intervals",
  })
  .refine((config) => config.reconnect.maxDelayMs >= config.reconnect.initialDelayMs, {
    path: ["reconnect", "maxDelayMs"],
    message: "Reconnect maximum delay must not be below the initial delay",
  })
  .refine((config) => config.pagination.maxPageSize >= config.pagination.defaultPageSize, {
    path: ["pagination", "maxPageSize"],
    message: "Pagination maximum must not be below its default",
  })
  .readonly()
export type DispatchConfig = z.infer<typeof DispatchConfigSchema>
