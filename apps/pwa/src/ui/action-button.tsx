import { Button } from "@kobalte/core/button"
import { CircleDashed } from "phosphor-solid"
import type { JSX } from "solid-js"

export type ActionVariant = "danger" | "ghost" | "primary" | "secondary"

type ActionButtonProps = {
  readonly ariaLabel?: string
  readonly busy?: boolean
  readonly children: JSX.Element
  readonly disabled?: boolean
  readonly iconOnly?: boolean
  readonly onClick?: (() => void) | undefined
  readonly testId?: string
  readonly type?: "button" | "submit"
  readonly variant?: ActionVariant | undefined
}

export function ActionButton(props: ActionButtonProps): JSX.Element {
  return (
    <Button
      aria-busy={props.busy}
      aria-label={props.ariaLabel}
      class={`action action--${props.variant ?? "secondary"}`}
      classList={{ "action--icon": props.iconOnly === true }}
      data-testid={props.testId}
      disabled={props.disabled === true || props.busy === true}
      onClick={props.onClick}
      type={props.type ?? "button"}
    >
      {props.busy === true ? <CircleDashed aria-hidden="true" size={20} weight="bold" /> : null}
      <span>{props.children}</span>
    </Button>
  )
}
