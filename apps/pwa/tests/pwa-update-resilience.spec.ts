import { fileURLToPath } from "node:url"
import { expect, type Locator, type Page, test } from "@playwright/test"

const EVIDENCE_DIR = fileURLToPath(new URL("../evidence/todo-11/", import.meta.url))

type Bounds = {
  readonly bottom: number
  readonly height: number
  readonly left: number
  readonly right: number
  readonly top: number
  readonly width: number
}

async function showWaitingWorkerUpdate(page: Page): Promise<void> {
  await page.goto("/sessions")
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if ((await page.evaluate(() => navigator.serviceWorker.controller !== null)) === false) {
    await page.reload()
  }

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    const nextScript = registration.active?.scriptURL.includes("qa-update=1")
      ? "/sw.js?qa-update=2"
      : "/sw.js?qa-update=1"
    await navigator.serviceWorker.register(nextScript, { scope: "/" })
  })
  await expect(page.getByTestId("pwa-update")).toBeVisible()
}

async function bounds(locator: Locator): Promise<Bounds> {
  return locator.evaluate((element) => {
    const rectangle = element.getBoundingClientRect()
    return {
      bottom: rectangle.bottom,
      height: rectangle.height,
      left: rectangle.left,
      right: rectangle.right,
      top: rectangle.top,
      width: rectangle.width,
    }
  })
}

function intersects(first: Bounds, second: Bounds): boolean {
  return !(
    first.right <= second.left ||
    second.right <= first.left ||
    first.bottom <= second.top ||
    second.bottom <= first.top
  )
}

async function expectUpdateLayoutInViewport(page: Page): Promise<void> {
  const updateNotice = page.getByTestId("pwa-update")
  const toast = await bounds(updateNotice.locator(".toast"))
  const status = await bounds(updateNotice.getByRole("status"))
  const actions = await bounds(updateNotice.locator(".toast__actions"))
  const update = await bounds(page.getByRole("button", { name: "Update now" }))
  const dismiss = await bounds(page.getByRole("button", { name: "Remind me later" }))
  const viewport = page.viewportSize()

  expect(viewport).not.toBeNull()
  for (const rectangle of [toast, status, actions, update, dismiss]) {
    expect(rectangle.width).toBeGreaterThan(0)
    expect(rectangle.height).toBeGreaterThan(0)
    expect(rectangle.left).toBeGreaterThanOrEqual(0)
    expect(rectangle.top).toBeGreaterThanOrEqual(0)
    expect(rectangle.right).toBeLessThanOrEqual(viewport?.width ?? 0)
    expect(rectangle.bottom).toBeLessThanOrEqual(viewport?.height ?? 0)
  }
  expect(intersects(status, actions)).toBe(false)
  expect(intersects(update, dismiss)).toBe(false)
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "375-light", "375px waiting-worker geometry only")
  await showWaitingWorkerUpdate(page)
})

test("keeps the 375px waiting-worker update layout in bounds", async ({ page }) => {
  await expectUpdateLayoutInViewport(page)
  await page.screenshot({
    animations: "disabled",
    path: `${EVIDENCE_DIR}update-toast-375-normal.png`,
  })
})

test("reflows the 375px waiting-worker update layout at 200 percent zoom", async ({ page }) => {
  await page.evaluate(() => {
    document.body.style.zoom = "2"
  })

  await expectUpdateLayoutInViewport(page)
  await page.screenshot({
    animations: "disabled",
    path: `${EVIDENCE_DIR}update-toast-375-zoom-200.png`,
  })
})

test("reflows the 375px waiting-worker update layout at 320 percent text zoom", async ({
  page,
}) => {
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "320%"
  })

  await expectUpdateLayoutInViewport(page)
  const status = page.getByTestId("pwa-update").getByRole("status")
  const scrollState = await status.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }
  })
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight)
  expect(scrollState.scrollTop).toBeGreaterThan(0)
  await status.evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    animations: "disabled",
    path: `${EVIDENCE_DIR}update-toast-375-text-320.png`,
  })
})
