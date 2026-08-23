import type { TimelineItem } from "@opencode-dispatch/contracts"
import { type JSX, Show } from "solid-js"

import { TranscriptPart } from "../../ui/sessions"

export function TimelineEntry(props: { readonly item: TimelineItem }): JSX.Element {
  switch (props.item.type) {
    case "user_message":
      return <TranscriptPart kind="user">{props.item.text}</TranscriptPart>
    case "assistant_text":
      return (
        <TranscriptPart kind="assistant" state={props.item.phase}>
          {props.item.text}
        </TranscriptPart>
      )
    case "assistant_reasoning":
      return (
        <TranscriptPart kind="reasoning" state={props.item.phase}>
          {props.item.text}
        </TranscriptPart>
      )
    case "tool":
      return (
        <details class="tool-card">
          <summary class="tool-card__summary">
            {props.item.name}: {props.item.state.status}
          </summary>
          <Show
            when={props.item.state.status === "completed" ? props.item.state.output : undefined}
          >
            {(output) => <pre class="tool-card__output">{output()}</pre>}
          </Show>
        </details>
      )
  }
}
