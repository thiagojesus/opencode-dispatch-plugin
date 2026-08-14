import AxeBuilder from "@axe-core/playwright"
import { expect, type Page, test } from "@playwright/test"

async function expectReachableFromNamedOwner(page: Page, selector: string): Promise<void> {
  const owners = page.locator('[data-scroll-owner="true"]')
  await expect(owners).toHaveCount(1)

  const reachability = await owners.evaluate((owner, targetSelector) => {
    const target = document.querySelector(targetSelector)
    if (!(owner instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return null
    }

    const targetBefore = target.getBoundingClientRect()
    const targetInitiallyVisible = targetBefore.bottom > 0 && targetBefore.top < window.innerHeight
    if (!targetInitiallyVisible && owner.contains(target)) {
      const ownerBefore = owner.getBoundingClientRect()
      owner.scrollTop += targetBefore.top - ownerBefore.top
    }

    const ownerAfter = owner.getBoundingClientRect()
    const targetAfter = target.getBoundingClientRect()
    const visibleTop = Math.max(0, ownerAfter.top)
    const visibleBottom = Math.min(window.innerHeight, ownerAfter.bottom)
    const targetVisibleInViewport = targetAfter.bottom > 0 && targetAfter.top < window.innerHeight

    return {
      documentScrollTop: document.documentElement.scrollTop,
      ownerScrollTop: owner.scrollTop,
      targetReachable:
        targetVisibleInViewport ||
        (owner.contains(target) &&
          targetAfter.bottom > visibleTop &&
          targetAfter.top < visibleBottom),
    }
  }, selector)

  expect(reachability).not.toBeNull()
  expect(reachability?.documentScrollTop).toBe(0)
  expect(reachability?.ownerScrollTop).toBeGreaterThanOrEqual(0)
  expect(reachability?.targetReachable).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.goto("/sessions")
})

test("has no detectable accessibility violations in the production shell", async ({ page }) => {
  // Given
  await expect(page.getByTestId("product-shell")).toBeVisible()

  // When
  const results = await new AxeBuilder({ page }).analyze()

  // Then
  expect(results.violations).toEqual([])
})

test("resolves the initial product theme from the emulated system preference", async ({
  page,
}, testInfo) => {
  // Given
  const expectedTheme = testInfo.project.name.endsWith("-dark") ? "dark" : "light"

  // When
  const theme = await page.locator("html").getAttribute("data-theme")

  // Then
  expect(theme).toBe(expectedTheme)
})

test("aligns primary navigation and theme preference on one header row", async ({ page }) => {
  // Given
  const navigation = page.getByRole("navigation", { name: "Primary" })
  const theme = page.getByRole("button", { name: "Theme preference: system" })

  // When
  const [navigationBox, themeBox] = await Promise.all([
    navigation.boundingBox(),
    theme.boundingBox(),
  ])

  // Then
  expect(navigationBox?.y).toBe(themeBox?.y)
})

test("reveals the focused skip link fully inside the viewport", async ({ page }) => {
  // Given
  const skipLink = page.getByTestId("product-skip-link")

  // When
  await page.keyboard.press("Tab")
  await page.waitForFunction(() => {
    const link = document.querySelector<HTMLElement>('[data-testid="product-skip-link"]')
    return link !== null && link.getBoundingClientRect().top >= 0
  })
  const box = await skipLink.boundingBox()

  // Then
  expect(box?.x).toBeGreaterThanOrEqual(0)
  expect(box?.y).toBeGreaterThanOrEqual(0)
})

test("reflows the product shell at 200 percent browser zoom", async ({ page }) => {
  // Given
  await expect(page.getByRole("heading", { exact: true, name: "Enabled sessions" })).toBeVisible()

  // When
  await page.evaluate(() => {
    document.body.style.zoom = "2"
  })

  // Then
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
  await expectReachableFromNamedOwner(page, "[data-testid='shell-scroll-owner']")
  await expectReachableFromNamedOwner(page, ".product-shell__dock")
})

test("reflows the product shell at 320 percent text zoom", async ({ page }) => {
  // Given
  await expect(page.getByRole("heading", { exact: true, name: "Enabled sessions" })).toBeVisible()

  // When
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "320%"
  })

  // Then
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
  await expectReachableFromNamedOwner(page, "[data-testid='shell-scroll-owner']")
  await expectReachableFromNamedOwner(page, ".product-shell__dock")
})

test("makes product transitions effectively instant for reduced motion", async ({ page }) => {
  // Given
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload()

  // When
  const durations = await page
    .getByRole("button", { name: "Theme preference: system" })
    .evaluate((element) => getComputedStyle(element).transitionDuration.split(", "))

  // Then
  expect(durations.every((duration) => duration === "0s" || duration === "0.001s")).toBe(true)
})

test("does not request a live API before the data-integration todo", async ({ page }) => {
  // Given
  const apiRequests: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiRequests.push(request.url())
    }
  })

  // When
  await page.reload()

  // Then
  expect(apiRequests).toEqual([])
})
