import { cleanup, render } from "@solidjs/testing-library"
import { createSignal } from "solid-js"
import { afterEach, expect, test } from "vitest"

import { AppShellPreview } from "../../src/showcase/app-shell"
import { ContinuityRail, StatePanel } from "../../src/showcase/continuity"
import { SessionRow } from "../../src/showcase/sessions"

afterEach(() => {
  cleanup()
})

test("exposes the current session without toggle-button semantics", () => {
  // Given
  const rendered = render(() => (
    <SessionRow selected={true} status="busy" title="Current design review" />
  ))

  // When
  const session = rendered.getByRole("button", { name: /Current design review/u })

  // Then
  expect(session.getAttribute("aria-current")).toBe("page")
  expect(session.hasAttribute("aria-pressed")).toBe(false)
})

test("keeps continuity recovery actions outside the live region", () => {
  // Given
  const rendered = render(() => (
    <ContinuityRail
      kind="offline"
      recovery={{ label: "Retry", onAction: () => undefined }}
      testId="offline-rail"
    />
  ))

  // When
  const liveRegion = rendered.getByRole("status")
  const retry = rendered.getByRole("button", { name: "Retry" })

  // Then
  expect(liveRegion.contains(retry)).toBe(false)
  expect(liveRegion.textContent).toContain("Updates are paused")
})

test("updates continuity text when the lifecycle signal changes", async () => {
  // Given
  const [kind, setKind] = createSignal<"enabled" | "offline">("enabled")
  const rendered = render(() => <ContinuityRail kind={kind()} testId="reactive-rail" />)

  // When
  setKind("offline")

  // Then
  expect(await rendered.findByText("Offline")).toBeDefined()
  expect(rendered.getByTestId("reactive-rail").textContent).not.toContain("Enabled")
})

test("keeps state-panel recovery actions outside the alert", () => {
  // Given
  const rendered = render(() => (
    <StatePanel
      actionLabel="Try again"
      description="The current snapshot could not be loaded."
      kind="error"
      title="Could not load state"
    />
  ))

  // When
  const alert = rendered.getByRole("alert")
  const recovery = rendered.getByRole("button", { name: "Try again" })

  // Then
  expect(alert.contains(recovery)).toBe(false)
  expect(alert.textContent).toContain("Could not load state")
})

test("names the preview scroll owner without adding another main landmark", () => {
  // Given
  const rendered = render(() => <AppShellPreview kind="normal" />)

  // When
  const shellBody = rendered.container.querySelector(".shell-body")

  // Then
  expect(shellBody?.tagName).toBe("DIV")
  expect(rendered.container.querySelectorAll("main")).toHaveLength(0)
})
