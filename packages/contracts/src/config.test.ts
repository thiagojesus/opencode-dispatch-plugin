import { describe, expect, test } from "bun:test"

import { DispatchConfigSchema } from "./index.ts"

describe("DispatchConfigSchema", () => {
  test("applies safe semantic defaults when configuration is empty", () => {
    const givenConfig = {}

    const parsedConfig = DispatchConfigSchema.parse(givenConfig)

    expect(parsedConfig).toEqual({
      version: 1,
      broker: { host: "127.0.0.1", port: 43110 },
      registration: { heartbeatIntervalMs: 5_000, ttlMs: 15_000 },
      reconnect: { initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 8 },
      pagination: { defaultPageSize: 50, maxPageSize: 100 },
    })
  })

  test("rejects a public broker bind when configuration requests all interfaces", () => {
    const givenConfig = { broker: { host: "0.0.0.0", port: 43110 } }

    const parsedConfig = DispatchConfigSchema.safeParse(givenConfig)

    expect(parsedConfig.success).toBe(false)
  })

  test("rejects a registration TTL below two heartbeat intervals", () => {
    const givenConfig = {
      registration: { heartbeatIntervalMs: 5_000, ttlMs: 9_999 },
    }

    const parsedConfig = DispatchConfigSchema.safeParse(givenConfig)

    expect(parsedConfig.success).toBe(false)
  })

  test("rejects a reconnect ceiling below its initial delay", () => {
    const givenConfig = {
      reconnect: { initialDelayMs: 1_000, maxDelayMs: 999, maxAttempts: 8 },
    }

    const parsedConfig = DispatchConfigSchema.safeParse(givenConfig)

    expect(parsedConfig.success).toBe(false)
  })

  test("rejects a pagination default above the page-size ceiling", () => {
    const givenConfig = {
      pagination: { defaultPageSize: 101, maxPageSize: 100 },
    }

    const parsedConfig = DispatchConfigSchema.safeParse(givenConfig)

    expect(parsedConfig.success).toBe(false)
  })

  test("rejects unknown configuration fields", () => {
    const givenConfig = { credential: "unsafe-default" }

    const parsedConfig = DispatchConfigSchema.safeParse(givenConfig)

    expect(parsedConfig.success).toBe(false)
  })
})
