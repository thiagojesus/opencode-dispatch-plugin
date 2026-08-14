import { DeviceMobile, List, PaperPlaneTilt } from "phosphor-solid"
import type { JSX } from "solid-js"

import { ActionButton } from "./actions"
import { type ContinuityKind, ContinuityRail } from "./continuity"
import { SessionRow, SessionSkeleton, TranscriptPart } from "./sessions"

type ShellKind = "loading" | "normal" | "offline" | "revoked"

type AppShellPreviewProps = {
  readonly kind: ShellKind
}

const SHELL_COPY: Record<
  ShellKind,
  { readonly label: string; readonly continuity: ContinuityKind }
> = {
  loading: { continuity: "reconnecting", label: "Loading snapshot" },
  normal: { continuity: "connected", label: "Connected shell" },
  offline: { continuity: "offline", label: "Offline shell" },
  revoked: { continuity: "revoked", label: "Revoked shell" },
}

export function AppShellPreview(props: AppShellPreviewProps): JSX.Element {
  const copy = SHELL_COPY[props.kind]

  return (
    <article aria-label={copy.label} class="app-shell" data-kind={props.kind}>
      <header class="app-shell__header cluster">
        <DeviceMobile aria-hidden="true" size={24} weight="bold" />
        <div>
          <strong>Dispatch preview</strong>
          <span>{copy.label}</span>
        </div>
      </header>
      <ContinuityRail
        kind={copy.continuity}
        recovery={
          copy.continuity === "offline"
            ? { label: "Retry", onAction: () => undefined }
            : copy.continuity === "revoked"
              ? { label: "Learn why", onAction: () => undefined, variant: "secondary" }
              : undefined
        }
      />
      <div class="app-shell__body shell-body">
        <aside aria-label={`${copy.label} example sessions`} class="app-shell__sessions stack">
          <div class="cluster app-shell__pane-title">
            <List aria-hidden="true" size={20} weight="bold" />
            <strong>Enabled sessions</strong>
          </div>
          {props.kind === "loading" ? (
            <>
              <SessionSkeleton />
              <SessionSkeleton />
            </>
          ) : (
            <>
              <SessionRow selected={true} status="busy" title="Current design review" />
              <SessionRow status="waiting" title="Accessibility pass" />
            </>
          )}
        </aside>
        <section
          aria-label={`${copy.label} transcript preview`}
          class="app-shell__transcript stack"
          tabindex="0"
        >
          <TranscriptPart
            kind="assistant"
            state={props.kind === "loading" ? "streaming" : "complete"}
          >
            <p>Current state appears here after a fresh local snapshot.</p>
          </TranscriptPart>
          <TranscriptPart kind={props.kind === "revoked" ? "error" : "system"}>
            <p>
              {props.kind === "revoked"
                ? "Remote access ended without changing the local session."
                : "This preview demonstrates one named transcript scroll owner."}
            </p>
          </TranscriptPart>
        </section>
      </div>
      <footer class="app-shell__dock cluster">
        <span>Action dock remains outside transcript scroll.</span>
        <ActionButton disabled={props.kind !== "normal"} variant="primary">
          <PaperPlaneTilt aria-hidden="true" size={20} weight="bold" />
          Send
        </ActionButton>
      </footer>
    </article>
  )
}

export function AppShellShowcase(): JSX.Element {
  return (
    <div class="shell-grid">
      <AppShellPreview kind="normal" />
      <AppShellPreview kind="loading" />
      <AppShellPreview kind="offline" />
      <AppShellPreview kind="revoked" />
    </div>
  )
}
