import { ArrowClockwise, ShieldCheck, ShieldWarning, WifiHigh, WifiSlash } from "phosphor-solid"
import type { JSX } from "solid-js"

import { ActionButton } from "./actions"

export type ContinuityKind = "connected" | "enabled" | "offline" | "reconnecting" | "revoked"

type ContinuityRailProps = {
  readonly kind: ContinuityKind
  readonly testId?: string
}

type StatePanelProps = {
  readonly actionLabel?: string
  readonly description: string
  readonly kind: "empty" | "error" | "offline" | "revoked"
  readonly testId?: string
  readonly title: string
}

const CONTINUITY_COPY: Record<
  ContinuityKind,
  { readonly consequence: string; readonly label: string }
> = {
  connected: {
    consequence: "Live updates follow the authoritative desktop session.",
    label: "Connected",
  },
  enabled: {
    consequence: "This session is explicitly available to your trusted device.",
    label: "Enabled",
  },
  offline: {
    consequence: "Updates are paused until the trusted connection returns.",
    label: "Offline",
  },
  reconnecting: {
    consequence: "Restoring the latest snapshot before new updates appear.",
    label: "Reconnecting",
  },
  revoked: {
    consequence: "Remote access ended. Return to the desktop to enable it again.",
    label: "Revoked",
  },
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled continuity state: ${value}`)
}

function ContinuityIcon(props: { readonly kind: ContinuityKind }): JSX.Element {
  switch (props.kind) {
    case "connected":
      return <WifiHigh aria-hidden="true" size={24} weight="bold" />
    case "enabled":
      return <ShieldCheck aria-hidden="true" size={24} weight="bold" />
    case "offline":
      return <WifiSlash aria-hidden="true" size={24} weight="bold" />
    case "reconnecting":
      return <ArrowClockwise aria-hidden="true" size={24} weight="bold" />
    case "revoked":
      return <ShieldWarning aria-hidden="true" size={24} weight="bold" />
    default:
      return assertNever(props.kind)
  }
}

export function ContinuityRail(props: ContinuityRailProps): JSX.Element {
  const copy = CONTINUITY_COPY[props.kind]
  const isUrgent = props.kind === "revoked"

  return (
    <div class="continuity-rail" data-kind={props.kind} data-testid={props.testId}>
      <span class="continuity-rail__line" aria-hidden="true" />
      <span class="icon-well">
        <ContinuityIcon kind={props.kind} />
      </span>
      <span class="continuity-rail__copy" role={isUrgent ? "alert" : "status"}>
        <strong>{copy.label}</strong>
        <span>{copy.consequence}</span>
      </span>
      {props.kind === "offline" ? <ActionButton>Retry</ActionButton> : null}
      {props.kind === "revoked" ? <ActionButton variant="secondary">Learn why</ActionButton> : null}
    </div>
  )
}

function StatePanelIcon(props: { readonly kind: StatePanelProps["kind"] }): JSX.Element {
  switch (props.kind) {
    case "empty":
      return <ShieldCheck aria-hidden="true" size={24} weight="bold" />
    case "error":
      return <ShieldWarning aria-hidden="true" size={24} weight="bold" />
    case "offline":
      return <WifiSlash aria-hidden="true" size={24} weight="bold" />
    case "revoked":
      return <ShieldWarning aria-hidden="true" size={24} weight="bold" />
    default:
      return assertNever(props.kind)
  }
}

export function StatePanel(props: StatePanelProps): JSX.Element {
  return (
    <div class="state-panel stack" data-kind={props.kind} data-testid={props.testId}>
      <span class="icon-well">
        <StatePanelIcon kind={props.kind} />
      </span>
      <div
        class="stack state-panel__copy"
        role={props.kind === "error" || props.kind === "revoked" ? "alert" : "status"}
      >
        <h3>{props.title}</h3>
        <p>{props.description}</p>
      </div>
      {props.actionLabel === undefined ? null : (
        <ActionButton variant={props.kind === "error" ? "primary" : "secondary"}>
          {props.actionLabel}
        </ActionButton>
      )}
    </div>
  )
}
