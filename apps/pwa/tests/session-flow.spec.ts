import { expect, test } from "@playwright/test"

const EPOCH = "550e8400-e29b-41d4-a716-446655440122"
const SESSION_ID = "ses-browser-flow"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const sockets: MockSocket[] = []
    class MockSocket extends EventTarget {
      static readonly OPEN = 1
      readonly readyState = MockSocket.OPEN
      constructor(readonly url: string) {
        super()
        sockets.push(this)
        queueMicrotask(() => this.dispatchEvent(new Event("open")))
      }
      send(): void {}
      close(): void {
        this.dispatchEvent(new CloseEvent("close"))
      }
      emit(frame: unknown): void {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) }))
      }
    }
    Object.defineProperty(globalThis, "WebSocket", { value: MockSocket })
    Object.defineProperty(globalThis, "__dispatchSessionFrame", {
      value: (frame: unknown) => sockets.at(-1)?.emit(frame),
    })
  })
})

test("navigates enabled sessions and converges a mid-stream transcript from a fresh snapshot", async ({
  page,
}) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  let snapshotRequests = 0
  await page.route("**/api/v1/sessions?limit=100", async (route) => {
    await route.fulfill({
      json: {
        type: "session_list",
        version: 1,
        brokerEpoch: EPOCH,
        sequence: 0,
        sessions: [
          {
            id: SESSION_ID,
            title: "Release verification",
            status: { type: "busy" },
            enabledAt: 1_754_352_000_000,
            updatedAt: 1_754_352_000_001,
            pendingPermissionCount: 0,
            pendingQuestionCount: 1,
          },
        ],
      },
    })
  })
  await page.route(`**/api/v1/sessions/${SESSION_ID}`, async (route) => {
    snapshotRequests += 1
    const complete = snapshotRequests > 1
    await route.fulfill({
      json: {
        type: "session_snapshot",
        version: 1,
        brokerEpoch: EPOCH,
        sequence: complete ? 1 : 0,
        session: {
          id: SESSION_ID,
          title: "Release verification",
          status: { type: complete ? "idle" : "busy" },
          enabledAt: 1_754_352_000_000,
          updatedAt: 1_754_352_000_001,
          pendingPermissionCount: 0,
          pendingQuestionCount: 0,
        },
        timeline: [
          {
            type: "user_message",
            messageId: "msg-user",
            text: "Run the final checks.",
            createdAt: 1_754_352_000_000,
          },
          {
            type: "assistant_text",
            messageId: "msg-assistant",
            partId: "part-answer",
            text: complete ? "All checks passed." : "Running checks",
            phase: complete ? "complete" : "streaming",
          },
        ],
        todos: [],
        pendingPermissions: [],
        pendingQuestions: [],
      },
    })
  })

  await page.goto("/sessions")
  await page.getByRole("button", { name: /Release verification/u }).click()
  await expect(page.getByRole("heading", { name: "Release verification" })).toBeVisible()
  await expect(page.getByText("Running checks")).toBeVisible()

  await page.evaluate(
    ({ brokerEpoch, sessionId }) => {
      const dispatch = Reflect.get(globalThis, "__dispatchSessionFrame")
      if (typeof dispatch === "function") {
        dispatch({
          type: "event",
          version: 1,
          brokerEpoch,
          sequence: 1,
          emittedAt: 1_754_352_000_002,
          sessionId,
          event: { type: "status.updated", status: { type: "idle" } },
        })
      }
    },
    { brokerEpoch: EPOCH, sessionId: SESSION_ID },
  )

  await expect(page.getByText("All checks passed.")).toBeVisible()
  await expect(page.getByText("Running checks")).toHaveCount(0)
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain("transcript")
  expect(snapshotRequests).toBe(2)
  expect(consoleErrors).toEqual([])
})
