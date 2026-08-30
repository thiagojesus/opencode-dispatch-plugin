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
    readonly requests: () => number
    readonly revoke: () => void
    readonly streams: () => number
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
        send(): void {
          queueMicrotask(() =>
            this.emit({
              type: "ready",
              version: 1,
              brokerEpoch,
              sequence: requestCount,
            }),
          )
        }
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
          requests: () => requestCount,
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
          streams: () => sockets.length,
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
  await expect.poll(() => page.evaluate(() => globalThis.__todo14Visual.streams())).toBe(1)
  await screenshot("ready")

  const recoveryRequestCount = await page.evaluate(() => globalThis.__todo14Visual.requests())
  await page.evaluate(() => globalThis.__todo14Visual.dropStream())
  await expect(page.getByRole("heading", { name: "Reconnecting" })).toBeVisible()
  await expect(page.getByTestId("product-continuity")).toHaveAttribute("data-kind", "reconnecting")
  await screenshot("reconnecting")
  await page.evaluate(() => globalThis.__todo14Visual.releaseRecovery())
  await expect
    .poll(() => page.evaluate(() => globalThis.__todo14Visual.requests()))
    .toBe(recoveryRequestCount + 1)
  await expect(page.getByTestId("product-continuity")).toHaveAttribute("data-kind", "connected")
  await expect.poll(() => page.evaluate(() => globalThis.__todo14Visual.streams())).toBe(2)

  await page.evaluate(() => window.dispatchEvent(new Event("offline")))
  await expect(page.getByRole("heading", { name: "Connection offline" })).toBeVisible()
  await expect(page.getByTestId("product-continuity")).toHaveAttribute("data-kind", "offline")
  await screenshot("offline")
  const onlineRequestCount = await page.evaluate(() => globalThis.__todo14Visual.requests())
  await page.evaluate(() => window.dispatchEvent(new Event("online")))
  await expect
    .poll(() => page.evaluate(() => globalThis.__todo14Visual.requests()))
    .toBe(onlineRequestCount + 1)
  await expect(page.getByTestId("product-continuity")).toHaveAttribute("data-kind", "connected")
  await expect.poll(() => page.evaluate(() => globalThis.__todo14Visual.streams())).toBe(3)

  await page.evaluate(() => globalThis.__todo14Visual.revoke())
  await expect(page.getByRole("heading", { name: "Access revoked" })).toBeVisible()
  await expect(page.getByTestId("product-continuity")).toHaveAttribute("data-kind", "revoked")
  await screenshot("revoked")
})
