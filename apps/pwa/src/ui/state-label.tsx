import type { JSX } from "solid-js"

type StateLabelProps = {
  readonly children: JSX.Element
  readonly tone?: "danger" | "info" | "success" | "warning"
}

export function StateLabel(props: StateLabelProps): JSX.Element {
  return (
    <span class="state-label" data-tone={props.tone ?? "info"}>
      {props.children}
    </span>
  )
}
