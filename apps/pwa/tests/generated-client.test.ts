import { expect, test } from "bun:test"
import {
  CapabilitiesResponseSchema,
  CONTROL_ACTIONS,
  CONTROL_CAPABILITY,
  MAX_PAGE_SIZE,
  MAX_PROMPT_BYTES,
  MAX_PUBLIC_PAYLOAD_BYTES,
  PaginationRequestSchema,
  PROTOCOL_VERSION,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"

import {
  type ApiTransport,
  createGeneratedApiClient,
  type GeneratedApiRequest,
} from "../src/api/generated-client"

test("parses a capabilities response when the transport returns the v1 contract", async () => {
  // Given
  const expected = CapabilitiesResponseSchema.parse({
    type: "capabilities",
    version: PROTOCOL_VERSION,
    controlCapability: CONTROL_CAPABILITY,
    actions: CONTROL_ACTIONS,
    maxPromptBytes: MAX_PROMPT_BYTES,
    maxResponseBytes: MAX_PUBLIC_PAYLOAD_BYTES,
    maxPageSize: MAX_PAGE_SIZE,
  })
  const requests: GeneratedApiRequest[] = []
  const transport: ApiTransport = {
    async request(input) {
      requests.push(input)
      return expected
    },
  }

  // When
  const result = await createGeneratedApiClient(transport).capabilities(
    new AbortController().signal,
  )

  // Then
  expect(result).toEqual(expected)
  expect(requests.map(({ method, path }) => ({ method, path }))).toEqual([
    { method: "GET", path: "/api/v1/capabilities" },
  ])
})

test("rejects an invalid session list while preserving the generated request path", async () => {
  // Given
  const requests: GeneratedApiRequest[] = []
  const transport: ApiTransport = {
    async request(input) {
      requests.push(input)
      return { type: "session_list" }
    },
  }
  const pagination = PaginationRequestSchema.parse({ limit: 25 })

  // When
  const pending = createGeneratedApiClient(transport).listSessions(
    pagination,
    new AbortController().signal,
  )

  // Then
  await expect(pending).rejects.toThrow()
  expect(requests.at(0)?.path).toBe("/api/v1/sessions?limit=25")
})

test("encodes a branded session identifier in the snapshot route", async () => {
  // Given
  const requests: GeneratedApiRequest[] = []
  const transport: ApiTransport = {
    async request(input) {
      requests.push(input)
      return { type: "session_snapshot" }
    },
  }
  const sessionId = SessionIdSchema.parse("session:alpha")

  // When
  const pending = createGeneratedApiClient(transport).sessionSnapshot(
    sessionId,
    new AbortController().signal,
  )

  // Then
  await expect(pending).rejects.toThrow()
  expect(requests.at(0)?.path).toBe("/api/v1/sessions/session%3Aalpha")
})
