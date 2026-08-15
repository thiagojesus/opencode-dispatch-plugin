import { cleanup, render } from "@solidjs/testing-library"
import { afterEach, expect, test } from "vitest"

import { PwaUpdatePrompt } from "../../src/pwa-update"

afterEach(() => {
  cleanup()
})

test("activates a waiting service worker when the update action is chosen", async () => {
  // Given
  const reloadRequests: (boolean | undefined)[] = []
  let announceUpdate: (() => void) | undefined
  const rendered = render(() => (
    <PwaUpdatePrompt
      registerWorker={(options) => {
        announceUpdate = options.onNeedRefresh
        return (reloadPage) => {
          reloadRequests.push(reloadPage)
          return Promise.resolve()
        }
      }}
    />
  ))

  if (announceUpdate === undefined) {
    throw new TypeError("The update callback was not registered")
  }

  // When
  announceUpdate()
  const status = await rendered.findByRole("status")
  const updateAction = await rendered.findByRole("button", { name: "Update now" })
  const dismissAction = await rendered.findByRole("button", { name: "Remind me later" })
  updateAction.click()

  // Then
  expect(status.contains(updateAction)).toBe(false)
  expect(dismissAction.classList.contains("action--icon")).toBe(true)
  expect(reloadRequests).toEqual([true])
})
