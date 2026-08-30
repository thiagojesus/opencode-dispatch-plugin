import {
  IdempotencyKeySchema,
  PublicErrorEnvelopeSchema,
  RemoteActionResponseSchema,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library"
import { createSignal } from "solid-js"
import { afterEach, expect, test } from "vitest"

import { RemoteApiError } from "../../src/api/generated-client"
import { PromptComposer, type RemoteActionClient } from "../../src/features/actions"

const SESSION_ID = SessionIdSchema.parse("session.alpha")
const IDEMPOTENCY_KEY = IdempotencyKeySchema.parse("11111111-1111-4111-8111-111111111111")

afterEach(() => {
  cleanup()
})

test("sends one prompt for duplicate taps and reports only the authoritative response", async () => {
  // Given
  const requests: Parameters<RemoteActionClient["executeAction"]>[0][] = []
  let resolveResponse:
    | ((value: ReturnType<typeof RemoteActionResponseSchema.parse>) => void)
    | undefined
  const pendingResponse = new Promise<ReturnType<typeof RemoteActionResponseSchema.parse>>(
    (resolve) => {
      resolveResponse = resolve
    },
  )
  const client: RemoteActionClient = {
    async executeAction(request) {
      requests.push(request)
      return pendingResponse
    },
  }
  const rendered = render(() => (
    <PromptComposer
      availability="active"
      client={client}
      idempotencyKeyFactory={() => IDEMPOTENCY_KEY}
      sessionId={SESSION_ID}
    />
  ))
  const input = rendered.getByRole("textbox", { name: "Prompt" })
  const send = rendered.getByRole("button", { name: "Send prompt" })
  fireEvent.input(input, { target: { value: "Summarize the current blocker." } })

  // When
  fireEvent.click(send)
  fireEvent.click(send)

  // Then
  expect(requests).toHaveLength(1)
  expect(rendered.getByRole("button", { name: "Sending prompt" }).hasAttribute("disabled")).toBe(
    true,
  )
  resolveResponse?.(
    RemoteActionResponseSchema.parse({
      type: "prompt_accepted",
      version: 1,
      sessionId: SESSION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      acceptedAt: 1_787_457_600_000,
      duplicate: false,
    }),
  )
  await waitFor(() => expect(rendered.getByText("Prompt accepted")).toBeDefined())
})

test("retries a prompt with the original idempotency key after a retryable timeout", async () => {
  // Given
  const requests: Parameters<RemoteActionClient["executeAction"]>[0][] = []
  let attempt = 0
  const client: RemoteActionClient = {
    async executeAction(request) {
      requests.push(request)
      attempt += 1
      if (attempt === 1) {
        throw new RemoteApiError(
          PublicErrorEnvelopeSchema.parse({
            type: "error",
            version: 1,
            error: {
              category: "upstream",
              code: "UPSTREAM_TIMEOUT",
              message: "The response timed out before acceptance was confirmed.",
              retryable: true,
            },
          }),
        )
      }
      return RemoteActionResponseSchema.parse({
        type: "prompt_accepted",
        version: 1,
        sessionId: SESSION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        acceptedAt: 1_787_457_600_001,
        duplicate: true,
      })
    },
  }
  const rendered = render(() => (
    <PromptComposer
      availability="active"
      client={client}
      idempotencyKeyFactory={() => IDEMPOTENCY_KEY}
      sessionId={SESSION_ID}
    />
  ))
  fireEvent.input(rendered.getByRole("textbox", { name: "Prompt" }), {
    target: { value: "Retry this exact prompt once." },
  })

  // When
  fireEvent.click(rendered.getByRole("button", { name: "Send prompt" }))
  const retry = await rendered.findByRole("button", { name: "Retry prompt" })
  fireEvent.click(retry)

  // Then
  await waitFor(() => expect(rendered.getByText("Prompt accepted")).toBeDefined())
  expect(requests).toHaveLength(2)
  expect(requests[0]?.type).toBe("prompt")
  expect(requests[1]?.type).toBe("prompt")
  if (requests[0]?.type === "prompt" && requests[1]?.type === "prompt") {
    expect(requests[0].idempotencyKey).toBe(requests[1].idempotencyKey)
    expect(requests[0].text).toBe(requests[1].text)
  }
})

test("does not claim prompt success when access is revoked during the request", async () => {
  // Given
  let resolveResponse:
    | ((value: ReturnType<typeof RemoteActionResponseSchema.parse>) => void)
    | undefined
  const client: RemoteActionClient = {
    async executeAction() {
      return new Promise((resolve) => {
        resolveResponse = resolve
      })
    },
  }
  const [availability, setAvailability] = createSignal<"active" | "revoked">("active")
  const rendered = render(() => (
    <PromptComposer
      availability={availability()}
      client={client}
      idempotencyKeyFactory={() => IDEMPOTENCY_KEY}
      sessionId={SESSION_ID}
    />
  ))
  fireEvent.input(rendered.getByRole("textbox", { name: "Prompt" }), {
    target: { value: "Do not report a stale success." },
  })
  fireEvent.click(rendered.getByRole("button", { name: "Send prompt" }))

  // When
  setAvailability("revoked")
  resolveResponse?.(
    RemoteActionResponseSchema.parse({
      type: "prompt_accepted",
      version: 1,
      sessionId: SESSION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      acceptedAt: 1_787_457_600_002,
      duplicate: false,
    }),
  )

  // Then
  await waitFor(() => expect(rendered.getByText("Access revoked")).toBeDefined())
  expect(rendered.queryByText("Prompt accepted")).toBeNull()
  expect(rendered.getByRole("button", { name: "Send unavailable" }).hasAttribute("disabled")).toBe(
    true,
  )
})
