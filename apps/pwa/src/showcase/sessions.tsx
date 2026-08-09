import { Button } from "@kobalte/core/button"
import { CheckCircle, CircleDashed, Question, WifiSlash } from "phosphor-solid"
import type { JSX } from "solid-js"

import { StateLabel } from "./section"

type SessionStatus = "busy" | "idle" | "offline" | "waiting"

type SessionRowProps = {
  readonly disabled?: boolean
  readonly selected?: boolean
  readonly status: SessionStatus
  readonly title: string
}

type TranscriptKind = "assistant" | "error" | "reasoning" | "system" | "user"

type TranscriptPartProps = {
  readonly children: JSX.Element
  readonly kind: TranscriptKind
  readonly state?: "complete" | "streaming"
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

export function SessionSkeleton(): JSX.Element {
  return (
    <div
      aria-busy="true"
      class="session-row session-row--skeleton"
      data-showcase-variant="skeleton-session-row"
      role="status"
    >
      <span class="visually-hidden">Loading session</span>
      <span aria-hidden="true" class="skeleton-block skeleton-block--title" />
      <span aria-hidden="true" class="skeleton-block skeleton-block--meta" />
    </div>
  )
}

function TranscriptSkeleton(): JSX.Element {
  return (
    <article
      aria-busy="true"
      class="transcript-part stack"
      data-showcase-variant="skeleton-transcript-part"
    >
      <span class="visually-hidden">Loading transcript part</span>
      <span aria-hidden="true" class="skeleton-block skeleton-block--meta" />
      <span aria-hidden="true" class="skeleton-block skeleton-block--title" />
    </article>
  )
}

function ToolSkeleton(): JSX.Element {
  return (
    <div
      aria-busy="true"
      class="tool-card tool-card__summary"
      data-showcase-variant="skeleton-tool-card"
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

export function SessionShowcase(): JSX.Element {
  return (
    <div class="split-grid">
      <div class="primitive-card stack">
        <h3>Session row states</h3>
        <SessionRow selected={true} status="busy" title="Build the mobile continuation flow" />
        <SessionRow status="waiting" title="Review the permission boundary" />
        <SessionRow status="idle" title="Document the reconnect contract" />
        <SessionRow status="offline" title="Resume after the trusted link returns" />
        <SessionRow disabled={true} status="offline" title="Process no longer available" />
        <SessionSkeleton />
      </div>
      <div class="primitive-card stack">
        <h3>Transcript part states</h3>
        <TranscriptPart kind="user">
          <p>Summarize the current blocker before continuing.</p>
        </TranscriptPart>
        <TranscriptPart kind="assistant" state="streaming">
          <p>The workspace is ready. I am checking the trust boundary now.</p>
        </TranscriptPart>
        <TranscriptPart kind="reasoning">
          <p>Reasoning summary: compare the live snapshot before applying queued updates.</p>
        </TranscriptPart>
        <TranscriptPart kind="system">
          <p>The trusted device resumed from a fresh authoritative snapshot.</p>
        </TranscriptPart>
        <TranscriptPart kind="error">
          <p>The update could not be applied. No remote action was sent.</p>
        </TranscriptPart>
      </div>
      <div class="primitive-card stack">
        <h3>Shape-matched loading states</h3>
        <TranscriptSkeleton />
        <ToolSkeleton />
      </div>
    </div>
  )
}
