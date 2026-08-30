import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test.beforeEach(({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "375-light", "Inclusive lifecycle profile only")
  return page.goto("/offline")
})

test("keeps lifecycle states operable for keyboard and screen-reader users", async ({ page }) => {
  await page.keyboard.press("Tab")
  await expect(page.getByTestId("product-skip-link")).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("main")).toBeFocused()
  await expect(page.getByRole("status").filter({ hasText: "Offline" })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await page.goto("/revoked")
  await expect(page.getByRole("alert").filter({ hasText: "Revoked" })).toBeVisible()
  await expect(page.getByTestId("lifecycle-revoked").getByRole("button")).toHaveCount(0)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test("keeps recovery reachable at browser and text zoom", async ({ page }) => {
  const retry = page.getByRole("button", { name: "Retry connection" })

  await page.evaluate(() => {
    document.body.style.zoom = "2"
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)
  await expect(retry).toBeVisible()

  await page.evaluate(() => {
    document.body.style.zoom = "1"
    document.documentElement.style.fontSize = "320%"
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)
  await expect(retry).toBeVisible()
})

test("preserves boundaries in forced colors and removes meaningful motion", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" })
  await page.reload()

  const statePanel = page.getByTestId("lifecycle-offline").locator(".state-panel")
  const styles = await statePanel.evaluate((element) => {
    const computed = getComputedStyle(element)
    return {
      borderStyle: computed.borderStyle,
      transitionDuration: computed.transitionDuration,
    }
  })
  expect(styles.borderStyle).toBe("solid")
  expect(["0s", "0.001s"]).toContain(styles.transitionDuration)
  await expect(page.getByRole("button", { name: "Retry connection" })).toBeVisible()
})
