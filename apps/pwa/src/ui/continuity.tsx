import { ArrowClockwise, ShieldCheck, ShieldWarning, WifiHigh, WifiSlash } from "phosphor-solid"
import type { JSX } from "solid-js"
import { Dynamic } from "solid-js/web"

import { ActionButton, type ActionVariant } from "./action-button"

export type ContinuityKind = "connected" | "enabled" | "offline" | "reconnecting" | "revoked"

type RecoveryAction = {
  readonly label: string
  readonly onAction: () => void
  readonly variant?: ActionVariant | undefined
}

type ContinuityRailProps = {
  readonly kind: ContinuityKind
  readonly recovery?: RecoveryAction | undefined
  readonly testId?: string
}

type StatePanelProps = {
  readonly actionLabel?: string | undefined
  readonly description: string
  readonly headingLevel?: "h2" | "h3" | undefined
  readonly kind: "empty" | "error" | "offline" | "revoked"
  readonly onAction?: (() => void) | undefined
  readonly showcaseVariant?: string | undefined
  readonly testId?: string | undefined
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
    consequence: "Only explicitly enabled local sessions can appear here.",
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

function continuityIcon(kind: ContinuityKind): JSX.Element {
  switch (kind) {
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
      return assertNever(kind)
  }
}

export function ContinuityRail(props: ContinuityRailProps): JSX.Element {
  const copy = () => CONTINUITY_COPY[props.kind]

  return (
    <div class="continuity-rail" data-kind={props.kind} data-testid={props.testId}>
      <span class="continuity-rail__line" aria-hidden="true" />
      <span class="icon-well">{continuityIcon(props.kind)}</span>
      <span class="continuity-rail__copy" role={props.kind === "revoked" ? "alert" : "status"}>
        <strong>{copy().label}</strong>
        <span>{copy().consequence}</span>
      </span>
      {props.recovery === undefined ? null : (
        <ActionButton
          onClick={props.recovery.onAction}
          variant={props.recovery.variant ?? "secondary"}
        >
          {props.recovery.label}
        </ActionButton>
      )}
    </div>
  )
}

function statePanelIcon(kind: StatePanelProps["kind"]): JSX.Element {
  switch (kind) {
    case "empty":
      return <ShieldCheck aria-hidden="true" size={24} weight="bold" />
    case "error":
      return <ShieldWarning aria-hidden="true" size={24} weight="bold" />
    case "offline":
      return <WifiSlash aria-hidden="true" size={24} weight="bold" />
    case "revoked":
      return <ShieldWarning aria-hidden="true" size={24} weight="bold" />
    default:
      return assertNever(kind)
  }
}

export function StatePanel(props: StatePanelProps): JSX.Element {
  return (
    <div
      class="state-panel stack"
      data-kind={props.kind}
      data-showcase-variant={props.showcaseVariant}
      data-testid={props.testId}
    >
      <span class="icon-well">{statePanelIcon(props.kind)}</span>
      <div
        class="stack state-panel__copy"
        role={props.kind === "error" || props.kind === "revoked" ? "alert" : "status"}
      >
        <Dynamic component={props.headingLevel ?? "h3"}>{props.title}</Dynamic>
        <p>{props.description}</p>
      </div>
      {props.actionLabel === undefined ? null : (
        <ActionButton
          onClick={props.onAction}
          variant={props.kind === "error" ? "primary" : "secondary"}
        >
          {props.actionLabel}
        </ActionButton>
      )}
    </div>
  )
}
