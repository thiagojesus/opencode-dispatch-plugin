import { Button } from "@kobalte/core/button"
import { CheckCircle, CircleDashed, Question, WifiSlash } from "phosphor-solid"
import type { JSX } from "solid-js"

import { StateLabel } from "./state-label"

export type SessionStatus = "busy" | "idle" | "offline" | "waiting"

type SessionRowProps = {
  readonly disabled?: boolean
  readonly selected?: boolean
  readonly status: SessionStatus
  readonly title: string
  readonly onSelect?: () => void
}

type TranscriptKind = "assistant" | "error" | "reasoning" | "system" | "user"

type TranscriptPartProps = {
  readonly children: JSX.Element
  readonly kind: TranscriptKind
  readonly state?: "complete" | "streaming"
}

type SkeletonProps = {
  readonly showcaseVariant?: string
}

const SESSION_STATUS_COPY: Record<SessionStatus, string> = {
  busy: "Working",
  idle: "Ready",
  offline: "Offline",
  waiting: "Waiting for input",
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled session state: ${value}`)
}

function SessionStatusIcon(props: { readonly status: SessionStatus }): JSX.Element {
  switch (props.status) {
    case "busy":
      return <CircleDashed aria-hidden="true" size={20} weight="bold" />
    case "idle":
      return <CheckCircle aria-hidden="true" size={20} weight="bold" />
    case "offline":
      return <WifiSlash aria-hidden="true" size={20} weight="bold" />
    case "waiting":
      return <Question aria-hidden="true" size={20} weight="bold" />
    default:
      return assertNever(props.status)
  }
}

export function SessionRow(props: SessionRowProps): JSX.Element {
  return (
    <Button
      aria-current={props.selected ? "page" : undefined}
      class="session-row"
      data-status={props.status}
      disabled={props.disabled}
      {...(props.onSelect === undefined ? {} : { onClick: props.onSelect })}
      type="button"
    >
      <span class="session-row__copy">
        <strong>{props.title}</strong>
        <span>Local workspace</span>
      </span>
      <span class="session-row__status">
        <SessionStatusIcon status={props.status} />
        <span>{SESSION_STATUS_COPY[props.status]}</span>
      </span>
    </Button>
  )
}

export function SessionSkeleton(props: SkeletonProps): JSX.Element {
  return (
    <div
      aria-busy="true"
      class="session-row session-row--skeleton"
      data-showcase-variant={props.showcaseVariant}
      role="status"
    >
      <span class="visually-hidden">Loading session</span>
      <span aria-hidden="true" class="skeleton-block skeleton-block--title" />
      <span aria-hidden="true" class="skeleton-block skeleton-block--meta" />
    </div>
  )
}

export function TranscriptSkeleton(props: SkeletonProps): JSX.Element {
  return (
    <article
      aria-busy="true"
      class="transcript-part stack"
      data-showcase-variant={props.showcaseVariant}
    >
      <span class="visually-hidden">Loading transcript part</span>
      <span aria-hidden="true" class="skeleton-block skeleton-block--meta" />
      <span aria-hidden="true" class="skeleton-block skeleton-block--title" />
    </article>
  )
}

export function ToolSkeleton(props: SkeletonProps): JSX.Element {
  return (
    <div
      aria-busy="true"
      class="tool-card tool-card__summary"
      data-showcase-variant={props.showcaseVariant}
      role="status"
    >
      <span class="visually-hidden">Loading tool card</span>
      <span aria-hidden="true" class="skeleton-block skeleton-block--meta" />
      <span aria-hidden="true" class="skeleton-block skeleton-block--title" />
    </div>
  )
}

export function TranscriptPart(props: TranscriptPartProps): JSX.Element {
  const label = props.kind === "user" ? "You" : props.kind

  return (
    <article
      class="transcript-part stack"
      data-kind={props.kind}
      data-state={props.state ?? "complete"}
    >
      <header class="cluster transcript-part__header">
        <strong>{label}</strong>
        <StateLabel tone={props.kind === "error" ? "danger" : "info"}>
          {props.state ?? "complete"}
        </StateLabel>
      </header>
      <div class="transcript-part__content">{props.children}</div>
    </article>
  )
}
