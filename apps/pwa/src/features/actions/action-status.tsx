import { createEffect, createSignal, type JSX, onCleanup } from "solid-js"

import { StateLabel } from "../../ui/state-label"
import type { ActionStatusState } from "./types"

type ActionStatusProps = {
  readonly state: ActionStatusState
  readonly testId?: string
}

const ANNOUNCEMENT_DELAY_MS = 160

export function ActionStatus(props: ActionStatusProps): JSX.Element {
  const [announcement, setAnnouncement] = createSignal("")
  let timer: number | undefined

  createEffect(() => {
    const message = props.state.message
    if (timer !== undefined) {
      window.clearTimeout(timer)
    }
    timer = window.setTimeout(() => {
      setAnnouncement(message)
    }, ANNOUNCEMENT_DELAY_MS)
  })

  onCleanup(() => {
    if (timer !== undefined) {
      window.clearTimeout(timer)
    }
  })

  return (
    <div class="action-status stack" data-kind={props.state.kind} data-testid={props.testId}>
      <div class="cluster">
        <StateLabel tone={props.state.tone}>{props.state.label}</StateLabel>
        <p>{props.state.message}</p>
      </div>
      <span
        aria-atomic="true"
        class="visually-hidden"
        role={props.state.tone === "danger" ? "alert" : "status"}
      >
        {announcement()}
      </span>
    </div>
  )
}
