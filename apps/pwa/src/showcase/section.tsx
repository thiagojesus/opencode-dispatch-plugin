import type { JSX } from "solid-js"

type ShowcaseSectionProps = {
  readonly children: JSX.Element
  readonly description: string
  readonly id: string
  readonly title: string
  readonly tone?: "plain" | "muted"
}

type StateLabelProps = {
  readonly children: JSX.Element
  readonly tone?: "danger" | "info" | "success" | "warning"
}

export function ShowcaseSection(props: ShowcaseSectionProps): JSX.Element {
  return (
    <section
      aria-labelledby={`${props.id}-title`}
      class="showcase-section stack"
      data-tone={props.tone ?? "plain"}
      id={props.id}
    >
      <div class="section-heading stack">
        <h2 id={`${props.id}-title`}>{props.title}</h2>
        <p>{props.description}</p>
      </div>
      {props.children}
    </section>
  )
}

export function StateLabel(props: StateLabelProps): JSX.Element {
  return (
    <span class="state-label" data-tone={props.tone ?? "info"}>
      {props.children}
    </span>
  )
}
