import { expect, test } from "../fixtures/browser.ts"

test("loads the production PWA through the ephemeral browser fixture", async ({
  fixtureOrigin,
  page,
}) => {
  const response = await page.goto(fixtureOrigin)

  expect(response?.status()).toBe(200)
  await expect(page.locator("main")).toHaveCount(1)
})
