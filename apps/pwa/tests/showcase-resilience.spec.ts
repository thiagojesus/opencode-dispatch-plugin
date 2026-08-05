import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
})

test("reflows without primary horizontal scrolling", async ({ page }) => {
  // Given
  await expect(page.getByRole("main")).toBeVisible()

  // When
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  // Then
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
})

test("keeps tablet session titles to natural two-line wrapping", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("768-"), "Tablet profiles own this regression")

  // Given
  const titles = page.locator(".app-shell__sessions .session-row__copy strong")

  // When
  const lineCounts = await titles.evaluateAll((elements) =>
    elements.map((element) => {
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight)
      return element.getBoundingClientRect().height / lineHeight
    }),
  )

  // Then
  expect(lineCounts.length).toBeGreaterThan(0)
  for (const lineCount of lineCounts) {
    expect(lineCount).toBeLessThanOrEqual(2.1)
  }
})

test("contains long and unbroken stress content inside its owner", async ({ page }) => {
  // Given
  await page.goto("/?stress=long")
  const stressContent = page.getByTestId("stress-string")

  // When
  const box = await stressContent.boundingBox()
  const viewport = page.viewportSize()

  // Then
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (box === null || viewport === null) {
    return
  }
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
})

test("keeps RTL-like stress content inside the primary viewport", async ({ page }) => {
  // Given
  await page.goto("/?stress=rtl")
  const stressContent = page.getByTestId("stress-rtl")

  // When
  const direction = await stressContent.evaluate((element) => getComputedStyle(element).direction)
  const primaryOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )

  // Then
  expect(direction).toBe("rtl")
  expect(primaryOverflow).toBe(false)
})

test("survives 200 percent browser-equivalent reflow", async ({ page }) => {
  // Given
  await expect(page.getByRole("main")).toBeVisible()

  // When
  await page.evaluate(() => {
    document.body.style.zoom = "2"
  })

  // Then
  await expect(page.getByRole("button", { name: "Open abort confirmation" })).toBeVisible()
  const primaryOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(primaryOverflow).toBe(false)
})

test("survives 320 percent text zoom", async ({ page }) => {
  // Given
  await expect(page.getByRole("main")).toBeVisible()

  // When
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "320%"
  })

  // Then
  await expect(page.getByRole("main")).toBeVisible()
  const primaryOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(primaryOverflow).toBe(false)
})

test("removes non-essential transition time for reduced motion", async ({ page }) => {
  // Given
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload()
  const trigger = page.getByRole("button", { name: "Open abort confirmation" })

  // When
  const duration = await trigger.evaluate((element) => getComputedStyle(element).transitionDuration)

  // Then
  const durations = duration.split(", ")
  expect(durations.every((value) => value === "0s" || value === "0.001s")).toBe(true)
})

test("renders explicit error and offline recovery states", async ({ page }) => {
  // Given
  await page.goto("/?stress=offline")

  // When
  const offline = page.getByTestId("stress-offline")

  // Then
  await expect(offline).toContainText("Offline")
  await expect(offline.getByRole("button", { name: "Retry connection" })).toBeVisible()

  // When
  await page.goto("/?stress=error")

  // Then
  const error = page.getByTestId("stress-error")
  await expect(error).toContainText("Could not load the current state")
  await expect(error.getByRole("button", { name: "Try again" })).toBeVisible()
})

test("serves the showcase shell after the network disappears", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "375-light", "One profile proves the generated SW fallback")

  // Given
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()

  // When
  await context.setOffline(true)
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.evaluate(() => window.dispatchEvent(new Event("offline")))

  // Then
  await expect(page.getByRole("main")).toBeVisible()
  await expect(page.getByTestId("network-offline")).toContainText("Offline")
  await context.setOffline(false)
})
