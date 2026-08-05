import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
})

test("has no detectable accessibility violations in every viewport and theme", async ({ page }) => {
  // Given
  await expect(page.getByRole("main")).toBeVisible()

  // When
  const results = await new AxeBuilder({ page }).analyze()

  // Then
  expect(results.violations).toEqual([])
})

test("moves keyboard focus through the skip link into main content", async ({ page }) => {
  // Given
  const skipLink = page.getByTestId("skip-link")
  const main = page.getByRole("main")

  // When
  await page.keyboard.press("Tab")

  // Then
  await expect(skipLink).toBeFocused()
  const outline = await skipLink.evaluate((element) => getComputedStyle(element).outlineStyle)
  expect(outline).not.toBe("none")

  // When
  await page.keyboard.press("Enter")

  // Then
  await expect(main).toBeFocused()
})

test("keeps a focused action visible and unclipped", async ({ page }) => {
  // Given
  const action = page.getByRole("button", { name: "Continue work" })

  // When
  await action.focus()
  const box = await action.boundingBox()
  const viewport = page.viewportSize()
  const outline = await action.evaluate((element) => getComputedStyle(element).boxShadow)

  // Then
  await expect(action).toBeFocused()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (box === null || viewport === null) {
    return
  }
  expect(outline).not.toBe("none")
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
})

test("keeps every visible interactive target at least 44 pixels", async ({ page }) => {
  // Given
  const targets = page.locator(
    "button:visible, a[href]:visible, input:visible, textarea:visible, summary:visible",
  )

  // When
  const count = await targets.count()

  // Then
  expect(count).toBeGreaterThan(0)
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox()
    expect(box).not.toBeNull()
    if (box === null) {
      continue
    }
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
})

test("uses the emulated system theme without losing state labels", async ({ page }, testInfo) => {
  // Given
  const expectedTheme = testInfo.project.name.endsWith("-dark") ? "dark" : "light"

  // When
  const colorScheme = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme,
  )

  // Then
  expect(colorScheme).toBe(expectedTheme)
  await expect(page.getByTestId("continuity-connected")).toContainText("Connected")
  await expect(page.getByTestId("continuity-offline")).toContainText("Offline")
  await expect(page.getByTestId("continuity-revoked")).toContainText("Revoked")
})
