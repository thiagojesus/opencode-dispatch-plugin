import { expect, test } from "@playwright/test"

const EPOCH = "550e8400-e29b-41d4-a716-446655440122"

declare global {
  var __todo14Lifecycle: {
    readonly dropStream: () => void
    readonly requests: () => number
    readonly setVisible: (visible: boolean) => void
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-mobile" && testInfo.project.name !== "webkit-mobile",
    "Mobile lifecycle projects only",
  )
  await page.addInitScript(
    ({ brokerEpoch }) => {
      let requestCount = 0
      let visible = true
      const sockets: MockSocket[] = []
      Math.random = () => 0
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (visible ? "visible" : "hidden"),
      })
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
      }
      Object.defineProperty(globalThis, "WebSocket", { value: MockSocket })
      Object.defineProperty(globalThis, "fetch", {
        value: async () => {
          requestCount += 1
          return new Response(
            JSON.stringify({
              type: "session_list",
              version: 1,
              brokerEpoch,
              sequence: requestCount,
              sessions: [
                {
                  id: "ses-resume",
                  title: "Background verification",
                  status: { type: "busy" },
                  enabledAt: 1_754_352_000_000,
                  updatedAt: 1_754_352_000_000 + requestCount,
                  pendingPermissionCount: 0,
                  pendingQuestionCount: 0,
                },
              ],
            }),
            { headers: { "content-type": "application/json" } },
          )
        },
      })
      Object.defineProperty(globalThis, "__todo14Lifecycle", {
        value: {
          dropStream: () => sockets.at(-1)?.close(),
          requests: () => requestCount,
          setVisible: (nextVisible: boolean) => {
            visible = nextVisible
            document.dispatchEvent(new Event("visibilitychange"))
          },
        },
      })
    },
    { brokerEpoch: EPOCH },
  )
})

test("resnapshots after background resume, network handoff, and stream loss", async ({ page }) => {
  await page.goto("/sessions")
  await expect(page.getByRole("button", { name: /Background verification/u })).toBeVisible()

  await page.evaluate(() => {
    globalThis.__todo14Lifecycle.setVisible(false)
    globalThis.__todo14Lifecycle.setVisible(true)
  })
  await expect(page.getByRole("heading", { name: "Reconnecting" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Background verification/u })).toBeVisible()

  await page.evaluate(() => window.dispatchEvent(new Event("offline")))
  await expect(page.getByRole("heading", { name: "Connection offline" })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event("online")))
  await expect(page.getByRole("heading", { name: "Reconnecting" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Background verification/u })).toBeVisible()

  await page.evaluate(() => {
    globalThis.__todo14Lifecycle.dropStream()
  })
  await expect(page.getByRole("heading", { name: "Reconnecting" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Background verification/u })).toBeVisible()
  expect(await page.evaluate(() => globalThis.__todo14Lifecycle.requests())).toBeGreaterThanOrEqual(
    4,
  )
})
