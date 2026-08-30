import { fileURLToPath } from "node:url"
import { expect, test } from "@playwright/test"

const EPOCH = "550e8400-e29b-41d4-a716-446655440122"
const EVIDENCE_DIR = fileURLToPath(
  new URL("../evidence/task-14-opencode-remote-dispatch-plugin/", import.meta.url),
)

declare global {
  var __todo14Visual: {
    readonly dropStream: () => void
    readonly releaseRecovery: () => void
    readonly revoke: () => void
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile" || testInfo.project.name === "webkit-mobile",
    "Responsive theme projects only",
  )
  await page.addInitScript(
    ({ brokerEpoch }) => {
      let holdRecovery = false
      let releaseRecovery: (() => void) | undefined
      let requestCount = 0
      const sockets: MockSocket[] = []
      Math.random = () => 0
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
      Object.defineProperty(globalThis, "fetch", {
        value: async () => {
          requestCount += 1
          if (holdRecovery) {
            await new Promise<void>((resolve) => {
              releaseRecovery = resolve
            })
          }
          return new Response(
            JSON.stringify({
              type: "session_list",
              version: 1,
              brokerEpoch,
              sequence: requestCount,
              sessions: [
                {
                  id: "ses-visual",
                  title: "Production resilience verification",
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
      Object.defineProperty(globalThis, "__todo14Visual", {
        value: {
          dropStream: () => {
            holdRecovery = true
            sockets.at(-1)?.close()
          },
          releaseRecovery: () => {
            holdRecovery = false
            releaseRecovery?.()
          },
          revoke: () => {
            sockets.at(-1)?.emit({
              type: "event",
              version: 1,
              brokerEpoch,
              sequence: requestCount + 1,
              emittedAt: 1_754_352_000_100,
              sessionId: "ses-visual",
              event: { type: "session.revoked", reason: "disabled" },
            })
          },
        },
      })
    },
    { brokerEpoch: EPOCH },
  )
})

test("captures ready, reconnecting, offline, and revoked production states", async ({
  page,
}, testInfo) => {
  const screenshot = async (state: string): Promise<void> => {
    await page.screenshot({
      animations: "disabled",
      path: `${EVIDENCE_DIR}${testInfo.project.name}-${state}.png`,
    })
  }

  await page.goto("/sessions")
  await expect(
    page.getByRole("button", { name: /Production resilience verification/u }),
  ).toBeVisible()
  await expect(page.getByTestId("product-continuity")).toHaveAttribute("data-kind", "connected")
  await screenshot("ready")

  await page.evaluate(() => globalThis.__todo14Visual.dropStream())
  await expect(page.getByRole("heading", { name: "Reconnecting" })).toBeVisible()
  await expect(page.getByTestId("product-continuity")).toHaveAttribute("data-kind", "reconnecting")
  await screenshot("reconnecting")
  await page.evaluate(() => globalThis.__todo14Visual.releaseRecovery())
  await expect(
    page.getByRole("button", { name: /Production resilience verification/u }),
  ).toBeVisible()

  await page.evaluate(() => window.dispatchEvent(new Event("offline")))
  await expect(page.getByRole("heading", { name: "Connection offline" })).toBeVisible()
  await expect(page.getByTestId("product-continuity")).toHaveAttribute("data-kind", "offline")
  await screenshot("offline")
  await page.evaluate(() => window.dispatchEvent(new Event("online")))
  await expect(
    page.getByRole("button", { name: /Production resilience verification/u }),
  ).toBeVisible()

  await page.evaluate(() => globalThis.__todo14Visual.revoke())
  await expect(page.getByRole("heading", { name: "Access revoked" })).toBeVisible()
  await expect(page.getByTestId("product-continuity")).toHaveAttribute("data-kind", "revoked")
  await screenshot("revoked")
})
