import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
})

test("exposes every previously missing design-system variant", async ({ page }) => {
  // Given
  const expectedVariants = [
    "question-single-choice",
    "question-multiple-choice",
    "question-free-response",
    "toast-info",
    "toast-success",
    "toast-warning",
    "toast-error",
    "skeleton-session-row",
    "skeleton-transcript-part",
    "skeleton-tool-card",
    "state-empty-transcript",
  ] as const

  // When
  const visibleVariants = await page
    .locator("[data-showcase-variant]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-showcase-variant")),
    )

  // Then
  expect(visibleVariants).toEqual(expect.arrayContaining([...expectedVariants]))
})

test("traps and restores focus for destructive confirmation", async ({ page }) => {
  // Given
  const trigger = page.getByRole("button", { name: "Open abort confirmation" })
  await trigger.focus()

  // When
  await trigger.click()

  // Then
  const dialog = page.getByRole("alertdialog", { name: "Abort active work?" })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole("button", { name: "Keep running" })).toBeFocused()

  // When
  await page.keyboard.press("Escape")

  // Then
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test("opens revoke confirmation with the safe action focused", async ({ page }) => {
  // Given
  const trigger = page.getByRole("button", { name: "Open revoke confirmation" })

  // When
  await trigger.click()

  // Then
  const dialog = page.getByRole("alertdialog", { name: "Revoke remote access?" })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole("button", { name: "Keep access" })).toBeFocused()
  await expect(page.getByRole("button", { name: "Revoke access" })).toBeVisible()
})

test("announces a toast without stealing focus", async ({ page }) => {
  // Given
  const trigger = page.getByRole("button", { name: "Show saved toast" })
  await trigger.focus()

  // When
  await trigger.click()

  // Then
  await expect(page.getByTestId("toast-region").getByRole("status")).toContainText("Saved")
  await expect(trigger).toBeFocused()
})

test("expands tool output with keyboard-operable disclosure", async ({ page }) => {
  // Given
  const disclosure = page.getByRole("button", { name: "Inspect tool output" })

  // When
  await disclosure.focus()
  await page.keyboard.press("Enter")

  // Then
  await expect(disclosure).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByTestId("tool-output-long")).toBeVisible()
})

test("shows explicit permission outcomes", async ({ page }) => {
  // Given
  const card = page.getByTestId("permission-interactive")

  // When
  await card.getByRole("button", { name: "Approve once" }).click()

  // Then
  await expect(card).toContainText("Approved once")
  await expect(card.getByRole("button", { name: "Approve once" })).toBeDisabled()
})

test("records an explicit permission rejection", async ({ page }) => {
  // Given
  const card = page.getByTestId("permission-interactive")

  // When
  await card.getByRole("button", { name: "Reject" }).click()

  // Then
  await expect(card).toContainText("Rejected")
  await expect(card.getByRole("button", { name: "Approve once" })).toBeDisabled()
  await expect(card.getByRole("button", { name: "Reject" })).toBeDisabled()
})

test("announces a question error before accepting an empty answer", async ({ page }) => {
  // Given
  const question = page.getByTestId("question-interactive")

  // When
  await question.getByRole("button", { name: "Submit answer" }).click()

  // Then
  await expect(question.getByRole("alert")).toContainText("Choose one answer before submitting")
  await expect(question).toContainText("Unanswered")
})

test("submits a labeled question and exposes the answered state", async ({ page }) => {
  // Given
  const question = page.getByTestId("question-interactive")
  const answer = question.getByRole("radio", { name: "Keep waiting" })

  // When
  await answer.check()
  await question.getByRole("button", { name: "Submit answer" }).click()

  // Then
  await expect(question).toContainText("Answered")
})

test("moves the composer into a semantic sending state", async ({ page }) => {
  // Given
  const composer = page.getByTestId("composer-interactive")
  const input = composer.getByRole("textbox", { name: "Follow-up message" })

  // When
  await input.fill("Summarize the current blocker.")
  await composer.getByRole("button", { name: "Send follow-up" }).click()

  // Then
  await expect(composer).toHaveAttribute("aria-busy", "true")
  await expect(composer.getByRole("button", { name: "Sending follow-up" })).toBeDisabled()
})

test("keeps an offline composer draft visible while disabling submission", async ({ page }) => {
  // Given
  const composer = page.getByTestId("composer-offline")

  // When
  const draft = composer.getByRole("textbox", { name: "Offline follow-up message" })

  // Then
  await expect(draft).toHaveValue("Preserve this draft until the trusted connection returns.")
  await expect(draft).toBeDisabled()
  await expect(
    composer.getByRole("button", { name: "Send unavailable while offline" }),
  ).toBeDisabled()
  await expect(composer).toContainText("Offline")
})

test("retries an errored composer without discarding its draft", async ({ page }) => {
  // Given
  const composer = page.getByTestId("composer-error")
  const draft = composer.getByRole("textbox", { name: "Failed follow-up message" })

  // When
  await composer.getByRole("button", { name: "Retry follow-up" }).click()

  // Then
  await expect(draft).toHaveValue("Summarize the failed check without replaying it.")
  await expect(composer).toHaveAttribute("aria-busy", "true")
  await expect(composer.getByRole("button", { name: "Sending follow-up" })).toBeDisabled()
})

test("shows the primary hover treatment", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "1280-light", "One mouse profile proves hover feedback")

  // Given
  const action = page.getByRole("button", { name: "Continue work" })
  const restingColor = await action.evaluate((element) => getComputedStyle(element).backgroundColor)

  // When
  await action.hover()

  // Then
  await expect
    .poll(() => action.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(restingColor)
})

test("shows the primary pressed treatment", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "1280-light", "One mouse profile proves active feedback")

  // Given
  const action = page.getByRole("button", { name: "Continue work" })
  await action.hover()

  // When
  await page.mouse.down()

  // Then
  await expect(action).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 4)")
  await page.mouse.up()
})
