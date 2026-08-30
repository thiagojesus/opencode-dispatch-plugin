import {
  type PermissionRequest,
  PermissionRequestSchema,
  PublicErrorEnvelopeSchema,
  RemoteActionResponseSchema,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library"
import { afterEach, expect, test } from "vitest"

import { RemoteApiError } from "../../src/api/generated-client"
import {
  AbortControl,
  PermissionCard,
  type RemoteActionClient,
  SafeMarkdown,
} from "../../src/features/actions"

const SESSION_ID = SessionIdSchema.parse("session.alpha")
const PERMISSION_REQUEST: PermissionRequest = PermissionRequestSchema.parse({
  id: "permission.write",
  action: "write",
  resources: ["apps/pwa/src/features/actions/prompt-composer.tsx"],
  source: { messageId: "message.1", callId: "call.1" },
})

afterEach(() => {
  cleanup()
})

test("offers only allow-once or confirmed rejection for an active permission", async () => {
  // Given
  const requests: Parameters<RemoteActionClient["executeAction"]>[0][] = []
  const client: RemoteActionClient = {
    async executeAction(request) {
      requests.push(request)
      if (request.type !== "permission_reply") {
        throw new TypeError("Expected a permission reply")
      }
      return RemoteActionResponseSchema.parse({
        type: "permission_reply_accepted",
        version: 1,
        sessionId: SESSION_ID,
        requestId: request.requestId,
        decision: request.decision,
      })
    },
  }
  const rendered = render(() => (
    <PermissionCard
      availability="active"
      client={client}
      request={PERMISSION_REQUEST}
      sessionId={SESSION_ID}
      workActive={true}
    />
  ))

  // When
  fireEvent.click(rendered.getByRole("button", { name: "Reject" }))

  // Then
  expect(requests).toHaveLength(0)
  expect(
    await screen.findByRole("alertdialog", { name: "Reject active permission?" }),
  ).toBeDefined()
  expect(rendered.queryByText(/always/iu)).toBeNull()

  // When
  fireEvent.click(screen.getByRole("button", { name: "Reject request" }))

  // Then
  await waitFor(() => expect(rendered.getByText("Permission rejected")).toBeDefined())
  expect(requests.at(0)).toMatchObject({ type: "permission_reply", decision: "reject" })
})

test("keeps stale abort handling inline instead of claiming success", async () => {
  // Given
  const client: RemoteActionClient = {
    async executeAction() {
      throw new RemoteApiError(
        PublicErrorEnvelopeSchema.parse({
          type: "error",
          version: 1,
          error: {
            category: "stale",
            code: "PENDING_ACTION_STALE",
            message: "The pending action is no longer current.",
            retryable: false,
          },
        }),
      )
    },
  }
  const rendered = render(() => (
    <AbortControl availability="active" client={client} sessionId={SESSION_ID} />
  ))

  // When
  fireEvent.click(rendered.getByRole("button", { name: "Abort work" }))
  fireEvent.click(await screen.findByRole("button", { name: "Confirm abort" }))

  // Then
  await waitFor(() =>
    expect(
      rendered.getByText("The active work already changed. Refresh before trying again."),
    ).toBeDefined(),
  )
  expect(rendered.queryByText("Work aborted")).toBeNull()
})

test("drops raw HTML and unsafe URLs while keeping external links and code copyable", async () => {
  // Given
  const copied: string[] = []
  const rendered = render(() => (
    <SafeMarkdown
      source={
        "<script>window.pwned = true</script>\n\n[unsafe](javascript:alert(1)) and [safe](https://example.com/docs)\n\n```ts\nconst safe = true\n```"
      }
      writeClipboard={async (value) => {
        copied.push(value)
      }}
    />
  ))

  // When
  const safeLink = rendered.getByRole("link", { name: /safe/u })
  fireEvent.click(rendered.getByRole("button", { name: "Copy code" }))

  // Then
  expect(rendered.container.querySelector("script, style, iframe, img")).toBeNull()
  expect(rendered.container.textContent).toContain("unsafe")
  expect(rendered.container.querySelector('a[href^="javascript:"]')).toBeNull()
  expect(safeLink.getAttribute("href")).toBe("https://example.com/docs")
  expect(safeLink.getAttribute("target")).toBe("_blank")
  expect(safeLink.getAttribute("rel")).toBe("noopener noreferrer")
  await waitFor(() => expect(copied).toEqual(["const safe = true\n"]))
  expect(rendered.getByText("Code copied")).toBeDefined()
})
