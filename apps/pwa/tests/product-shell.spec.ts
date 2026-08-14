import { expect, test } from "@playwright/test"

test("renders the production session route instead of the primitive showcase", async ({ page }) => {
  // Given
  await page.goto("/sessions")

  // When
  const shell = page.getByTestId("product-shell")

  // Then
  await expect(shell).toBeVisible()
  await expect(shell.getByRole("heading", { level: 1, name: "Enabled sessions" })).toBeVisible()
  await expect(page.getByRole("main")).toHaveCount(1)
  await expect(page.getByRole("heading", { name: "Continue with confidence." })).toHaveCount(0)
})

test("preserves the design-system showcase on its named route", async ({ page }) => {
  // Given
  await page.goto("/showcase")

  // When
  const heading = page.getByRole("heading", { level: 1, name: "Continue with confidence." })

  // Then
  await expect(heading).toBeVisible()
  await expect(page.getByText("Primitive showcase only.", { exact: false })).toBeVisible()
})

test("bounds the app shell and names its single body scroll owner", async ({ page }) => {
  // Given
  await page.goto("/sessions")

  // When
  const metrics = await page.getByTestId("product-shell").evaluate((shell) => {
    const owner = shell.querySelector<HTMLElement>("[data-testid='shell-scroll-owner']")
    const header = shell.querySelector("header")
    const dock = shell.querySelector("footer")
    if (owner === null || header === null || dock === null) {
      return null
    }
    return {
      documentScrolls:
        document.documentElement.scrollHeight > document.documentElement.clientHeight,
      headerInsideOwner: owner.contains(header),
      dockInsideOwner: owner.contains(dock),
      ownerOverflow: getComputedStyle(owner).overflowY,
      shellHeight: shell.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }
  })

  // Then
  expect(metrics).not.toBeNull()
  expect(metrics?.documentScrolls).toBe(false)
  expect(metrics?.headerInsideOwner).toBe(false)
  expect(metrics?.dockInsideOwner).toBe(false)
  expect(metrics?.ownerOverflow).toBe("auto")
  expect(metrics?.shellHeight).toBeLessThanOrEqual(metrics?.viewportHeight ?? 0)
})

test("renders the offline lifecycle with a reachable recovery action", async ({ page }) => {
  // Given
  await page.goto("/offline")

  // When
  const state = page.getByTestId("lifecycle-offline")

  // Then
  await expect(state.getByRole("heading", { name: "Connection offline" })).toBeVisible()
  await expect(state.getByRole("button", { name: "Retry connection" })).toBeVisible()
  await expect(page.getByTestId("product-continuity")).toContainText("Offline")
})

test("renders revoked access without exposing an unsupported remote action", async ({ page }) => {
  // Given
  await page.goto("/revoked")

  // When
  const state = page.getByTestId("lifecycle-revoked")

  // Then
  await expect(state.getByRole("heading", { name: "Access revoked" })).toBeVisible()
  await expect(state.getByRole("button")).toHaveCount(0)
  await expect(page.getByTestId("product-continuity")).toContainText("Revoked")
})

test("renders a typed safe error state without raw failure details", async ({ page }) => {
  // Given
  await page.goto("/error")

  // When
  const state = page.getByTestId("lifecycle-error")

  // Then
  await expect(state.getByRole("heading", { name: "Could not load current state" })).toBeVisible()
  await expect(state).not.toContainText("stack")
  await expect(state).not.toContainText("Error:")
})

test("shows a shape-matched loading route before authoritative session data exists", async ({
  page,
}) => {
  // Given
  await page.goto("/sessions/session-for-layout")

  // When
  const detail = page.getByTestId("session-detail-pane")

  // Then
  await expect(detail.getByRole("heading", { name: "Loading session" })).toBeVisible()
  await expect(detail.locator('[aria-busy="true"]')).not.toHaveCount(0)
})

test("uses mobile route stacking and wider list-detail composition", async ({ page }, testInfo) => {
  // Given
  await page.goto("/sessions/session-for-layout")

  // When
  const list = page.getByTestId("session-list-pane")
  const detail = page.getByTestId("session-detail-pane")

  // Then
  await expect(detail).toBeVisible()
  if (testInfo.project.name.startsWith("375-")) {
    await expect(list).toBeHidden()
  } else {
    await expect(list).toBeVisible()
  }
})

test("persists only the explicit theme preference across reload", async ({ page }) => {
  // Given
  await page.goto("/sessions")
  const themeControl = page.getByRole("button", { name: "Theme preference: system" })

  // When
  await themeControl.click()
  await page.reload()

  // Then
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
  await expect(page.getByRole("button", { name: "Theme preference: light" })).toBeVisible()
  const storedKeys = await page.evaluate(() => Object.keys(localStorage))
  expect(storedKeys).toEqual(["opencode-dispatch-theme"])
})

test("updates lifecycle copy from explicit browser network events", async ({ page }) => {
  // Given
  await page.goto("/sessions")

  // When
  await page.evaluate(() => window.dispatchEvent(new Event("offline")))

  // Then
  await expect(page.getByTestId("product-continuity")).toContainText("Offline")
})

test("keeps injected long content inside the named shell owner", async ({ page }) => {
  // Given
  await page.goto("/sessions/session-for-layout")

  // When
  await page.getByTestId("session-detail-pane").evaluate((pane) => {
    const article = document.createElement("article")
    const paragraph = document.createElement("p")
    article.className = "transcript-part stack"
    paragraph.textContent = "unbroken".repeat(6250)
    article.append(paragraph)
    pane.append(article)
  })

  // Then
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
  await expect(page.getByTestId("product-shell")).toBeVisible()
})

test("moves keyboard focus through the product skip link", async ({ page }) => {
  // Given
  await page.goto("/sessions")

  // When
  await page.keyboard.press("Tab")

  // Then
  const skipLink = page.getByTestId("product-skip-link")
  await expect(skipLink).toBeFocused()

  // When
  await page.keyboard.press("Enter")

  // Then
  await expect(page.getByRole("main")).toBeFocused()
})

test("keeps product controls at least 44 pixels in both axes", async ({ page }) => {
  // Given
  await page.goto("/sessions")

  // When
  const targets = page.locator("button:visible, a[href]:visible")
  const boxes = await targets.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return { height: box.height, width: box.width }
    }),
  )

  // Then
  expect(boxes.length).toBeGreaterThan(0)
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
})
