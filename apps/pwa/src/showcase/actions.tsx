import { Button } from "@kobalte/core/button"
import { ArrowClockwise, CircleDashed } from "phosphor-solid"
import type { JSX } from "solid-js"

type ActionVariant = "danger" | "ghost" | "primary" | "secondary"

type ActionButtonProps = {
  readonly ariaLabel?: string
  readonly busy?: boolean
  readonly children: JSX.Element
  readonly disabled?: boolean
  readonly onClick?: () => void
  readonly type?: "button" | "submit"
  readonly variant?: ActionVariant
}

export function ActionButton(props: ActionButtonProps): JSX.Element {
  return (
    <Button
      aria-busy={props.busy}
      aria-label={props.ariaLabel}
      class={`action action--${props.variant ?? "secondary"}`}
      disabled={props.disabled === true || props.busy === true}
      onClick={props.onClick}
      type={props.type ?? "button"}
    >
      {props.busy === true ? <CircleDashed aria-hidden="true" size={20} weight="bold" /> : null}
      <span>{props.children}</span>
    </Button>
  )
}

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
