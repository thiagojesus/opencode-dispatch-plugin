import { describe, expect, test } from "bun:test"

import {
  ProcessExposureSchema,
  ProcessLifecycleMessageSchema,
  processNonceForLifecycleMessage,
} from "./index.ts"

const PROCESS_NONCE = "550e8400-e29b-41d4-a716-446655440000"
const NOW = 1_754_352_000_000

describe("process lifecycle contracts", () => {
  test("parses every process lifecycle variant and preserves process identity", () => {
    const givenMessages = [
      {
        type: "process.register",
        version: 1,
        processNonce: PROCESS_NONCE,
        serverUrl: "http://127.0.0.1:4096",
        pid: 4242,
        startedAt: NOW,
      },
      {
        type: "process.heartbeat",
        version: 1,
        processNonce: PROCESS_NONCE,
        sentAt: NOW + 5_000,
      },
      {
        type: "process.unregister",
        version: 1,
        processNonce: PROCESS_NONCE,
        sentAt: NOW + 6_000,
        reason: "dispose",
      },
    ]

    const parsedMessages = givenMessages.map((message) =>
      ProcessLifecycleMessageSchema.parse(message),
    )
    const processNonces = parsedMessages.map(processNonceForLifecycleMessage)

    expect(processNonces.join(",")).toBe(Array.from({ length: 3 }, () => PROCESS_NONCE).join(","))
  })

  test("rejects a registered non-loopback OpenCode server URL", () => {
    const givenRegistration = {
      type: "process.register",
      version: 1,
      processNonce: PROCESS_NONCE,
      serverUrl: "https://example.com:4096",
      pid: 4242,
      startedAt: NOW,
    }

    const parsedRegistration = ProcessLifecycleMessageSchema.safeParse(givenRegistration)

    expect(parsedRegistration.success).toBe(false)
  })

  test("rejects an unknown process lifecycle discriminator", () => {
    const givenMessage = {
      type: "process.restart",
      version: 1,
      processNonce: PROCESS_NONCE,
      sentAt: NOW,
    }

    const parsedMessage = ProcessLifecycleMessageSchema.safeParse(givenMessage)

    expect(parsedMessage.success).toBe(false)
  })

  test("rejects transcript content in a process-bound exposure record", () => {
    const givenExposure = {
      version: 1,
      sessionId: "ses_contracts",
      processNonce: PROCESS_NONCE,
      title: "Contract work",
      enabledAt: NOW,
      transcript: "must not persist",
    }

    const parsedExposure = ProcessExposureSchema.safeParse(givenExposure)

    expect(parsedExposure.success).toBe(false)
  })
})
