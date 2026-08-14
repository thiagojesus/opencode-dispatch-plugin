import { Button } from "@kobalte/core/button"
import { ArrowClockwise } from "phosphor-solid"
import type { JSX } from "solid-js"

import { ActionButton } from "../ui/action-button"

export { ActionButton } from "../ui/action-button"

export function ActionShowcase(): JSX.Element {
  return (
    <div class="primitive-card stack">
      <div class="cluster">
        <ActionButton variant="primary">Continue work</ActionButton>
        <ActionButton>Review details</ActionButton>
        <ActionButton variant="ghost">Dismiss</ActionButton>
        <ActionButton variant="danger">Revoke access</ActionButton>
      </div>
      <div class="cluster">
        <ActionButton busy={true} variant="primary">
          Connecting
        </ActionButton>
        <ActionButton disabled={true}>Unavailable</ActionButton>
        <Button aria-label="Refresh preview" class="action action--icon" type="button">
          <ArrowClockwise aria-hidden="true" size={20} weight="bold" />
        </Button>
      </div>
    </div>
  )
}
