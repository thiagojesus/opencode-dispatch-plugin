import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const EVIDENCE_DIR = "evidence/todo-13/"
const STATE_EVIDENCE_STYLE = ".skip-link { visibility: hidden !important; }"

test.beforeEach(async ({ page }) => {
  await page.goto("/showcase?fixture=actions")
})

test("completes every authoritative intervention flow with keyboard and touch controls", async ({
  page,
}, testInfo) => {
  // Given
  await expect(
    page.getByRole("heading", { level: 1, name: "Remote intervention flows" }),
  ).toBeVisible()

  // When
  await page.getByRole("textbox", { name: "Prompt" }).fill("Summarize the current blocker.")
  await page.getByRole("button", { name: "Send prompt" }).click()

  // Then
  await expect(
    page
      .getByTestId("prompt-composer")
      .locator("p")
      .filter({ hasText: /^Prompt accepted$/u }),
  ).toBeVisible()

  // When
  const question = page.getByTestId("question-card")
  await question.getByRole("radio", { name: /^Continue\b/u }).check()
  await question.getByRole("checkbox", { name: /^Type checks\b/u }).check()
  await question.getByRole("checkbox", { name: /^Accessibility\b/u }).check()
  await question
    .getByRole("textbox", { name: "Custom answer for Constraint" })
    .fill("Keep the response readonly.")
  await question.getByRole("button", { name: "Submit answers" }).click()

  // Then
  await expect(question.getByText("Answers accepted", { exact: true })).toBeVisible()

  // When
  const approval = page.getByTestId("permission-allow-once")
  await approval.getByRole("button", { name: "Allow once" }).click()

  // Then
  await expect(approval.getByText("Permission allowed once", { exact: true })).toBeVisible()

  // When
  const rejection = page.getByTestId("permission-reject")
  await rejection.getByRole("button", { name: "Reject" }).click()
  const rejectDialog = page.getByRole("alertdialog", { name: "Reject active permission?" })

  // Then
  await expect(rejectDialog).toBeVisible()
  await expect(page.getByRole("button", { name: "Keep permission pending" })).toBeFocused()
  if (testInfo.project.name === "375-light") {
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${EVIDENCE_DIR}action-flows-375-light-reject-dialog.png`,
      style: STATE_EVIDENCE_STYLE,
    })
  }

  // When
  await page.getByRole("button", { name: "Reject request" }).click()

  // Then
  await expect(rejection.getByText("Permission rejected", { exact: true })).toBeVisible()

  // When
  const abort = page.getByTestId("abort-control")
  const abortTrigger = abort.getByRole("button", { name: "Abort work" })
  await abortTrigger.focus()
  await page.keyboard.press("Enter")

  // Then
  await expect(page.getByRole("alertdialog", { name: "Abort active work?" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Keep running" })).toBeFocused()
  if (testInfo.project.name === "375-light") {
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${EVIDENCE_DIR}action-flows-375-light-abort-dialog.png`,
      style: STATE_EVIDENCE_STYLE,
    })
  }

  // When
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "Confirm abort" })).toBeFocused()
  await page.keyboard.press("Enter")

  // Then
  await expect(abort.getByText("Work aborted", { exact: true })).toBeVisible()
  await expect(abort.getByRole("button", { name: "Abort work" })).toBeDisabled()
  if (testInfo.project.name === "375-light") {
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: `${EVIDENCE_DIR}action-flows-375-light-complete.png`,
      style: STATE_EVIDENCE_STYLE,
    })
  }
})

test("rejects oversized prompts and renders sanitized model text without an always path", async ({
  page,
}) => {
  // Given
  const composer = page.getByTestId("prompt-composer")
  const markdown = page.getByTestId("safe-model-markdown")

  // When
  await composer.getByRole("textbox", { name: "Prompt" }).fill("x".repeat(32_769))
  await composer.getByRole("button", { name: "Send prompt" }).click()

  // Then
  await expect(composer).toContainText("Enter a prompt within the 32 KiB limit before sending.")
  await expect(page.getByText(/always/iu)).toHaveCount(0)
  await expect(markdown.locator("script, style, iframe, img")).toHaveCount(0)
  await expect(markdown.locator('a[href^="javascript:"]')).toHaveCount(0)
  const safeLink = markdown.getByRole("link", { name: /safe reference/u })
  await expect(safeLink).toHaveAttribute("href", "https://example.com/docs")
  await expect(safeLink).toHaveAttribute("target", "_blank")
  await expect(safeLink).toHaveAttribute("rel", "noopener noreferrer")

  // When
  await markdown.getByRole("button", { name: "Copy code" }).click()

  // Then
  await expect(markdown.getByText("Code copied", { exact: true })).toBeVisible()
})

test("keeps the intervention fixture axe-clean with tactile controls", async ({
  page,
}, testInfo) => {
  // Given
  const main = page.getByRole("main")
  await expect(main).toBeVisible()

  // When
  const results = await new AxeBuilder({ page }).analyze()
  const boxes = await main
    .locator("button:visible, a[href]:visible, input:visible, textarea:visible")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect()
        return {
          height: box.height,
          label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
          tag: element.tagName.toLowerCase(),
          width: box.width,
        }
      }),
    )

  // Then
  expect(results.violations).toEqual([])
  expect(boxes.length).toBeGreaterThan(0)
  for (const box of boxes) {
    expect(box.width, `${box.tag} ${box.label}`).toBeGreaterThanOrEqual(44)
    expect(box.height, `${box.tag} ${box.label}`).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: `${EVIDENCE_DIR}action-flows-${testInfo.project.name}.png`,
  })
})
