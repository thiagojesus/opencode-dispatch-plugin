import { A } from "@solidjs/router"
import type { JSX } from "solid-js"

import { StatePanel } from "../ui/continuity"
import { SessionSkeleton, ToolSkeleton, TranscriptSkeleton } from "../ui/sessions"

type LifecyclePageModel = {
  readonly description: string
  readonly kind: "error" | "offline" | "revoked"
  readonly panelTitle: string
  readonly testId: string
  readonly title: string
}

const LIFECYCLE_PAGES = {
  error: {
    description: "The current state is unavailable. No remote action was sent or repeated.",
    kind: "error",
    panelTitle: "No action was sent",
    testId: "lifecycle-error",
    title: "Could not load current state",
  },
  offline: {
    description:
      "Updates are paused until the trusted connection returns. Local work is unchanged.",
    kind: "offline",
    panelTitle: "Updates paused",
    testId: "lifecycle-offline",
    title: "Connection offline",
  },
  revoked: {
    description: "Return to the desktop to explicitly enable remote access again.",
    kind: "revoked",
    panelTitle: "Desktop re-enable required",
    testId: "lifecycle-revoked",
    title: "Access revoked",
  },
} as const satisfies Record<"error" | "offline" | "revoked", LifecyclePageModel>

function LifecyclePage(props: { readonly model: LifecyclePageModel }): JSX.Element {
  const retry = props.model.kind === "offline" ? () => window.location.reload() : undefined

  return (
    <section class="product-route product-state-view stack" data-testid={props.model.testId}>
      <p class="product-kicker">Connection state</p>
      <h1>{props.model.title}</h1>
      <StatePanel
        actionLabel={retry === undefined ? undefined : "Retry connection"}
        description={props.model.description}
        headingLevel="h2"
        kind={props.model.kind}
        onAction={retry}
        title={props.model.panelTitle}
      />
      <A class="action action--ghost product-back" href="/sessions">
        Return to sessions
      </A>
    </section>
  )
}

export function SessionsRoute(): JSX.Element {
  return (
    <section class="product-route product-list-detail" data-mobile-route="list">
      <section class="session-pane session-pane--list stack" data-testid="session-list-pane">
        <header class="product-route__heading stack">
          <p class="product-kicker">Local availability</p>
          <h1>Enabled sessions</h1>
          <p>Only sessions explicitly enabled on the desktop can appear on this trusted device.</p>
        </header>
        <StatePanel
          description="Nothing is exposed remotely. Enable a live session from the desktop when you need mobile continuation."
          headingLevel="h2"
          kind="empty"
          title="No enabled sessions"
        />
      </section>
      <aside
        aria-label="Session detail"
        class="session-pane session-pane--detail stack"
        data-testid="session-detail-pane"
      >
        <p class="product-kicker">Session detail</p>
        <h2>Select an enabled session</h2>
        <p>The latest authoritative snapshot will open here without storing transcript data.</p>
      </aside>
    </section>
  )
}

export function SessionLoadingRoute(): JSX.Element {
  return (
    <section class="product-route product-list-detail" data-mobile-route="detail">
      <aside
        aria-label="Enabled sessions"
        class="session-pane session-pane--list stack"
        data-testid="session-list-pane"
      >
        <h2>Enabled sessions</h2>
        <SessionSkeleton />
        <SessionSkeleton />
      </aside>
      <section class="session-pane session-pane--detail stack" data-testid="session-detail-pane">
        <A class="action action--ghost product-back" href="/sessions">
          Back to sessions
        </A>
        <header class="product-route__heading stack">
          <p class="product-kicker">Authoritative snapshot</p>
          <h1>Loading session</h1>
          <p>No transcript or action is shown until the current local snapshot is verified.</p>
        </header>
        <section aria-label="Loading session content" class="loading-stack stack">
          <TranscriptSkeleton />
          <TranscriptSkeleton />
          <ToolSkeleton />
        </section>
      </section>
    </section>
  )
}

export function OfflineRoute(): JSX.Element {
  return <LifecyclePage model={LIFECYCLE_PAGES.offline} />
}

export function RevokedRoute(): JSX.Element {
  return <LifecyclePage model={LIFECYCLE_PAGES.revoked} />
}

export function ErrorRoute(): JSX.Element {
  return <LifecyclePage model={LIFECYCLE_PAGES.error} />
}

export function NotFoundRoute(): JSX.Element {
  return (
    <section class="product-route product-state-view stack">
      <p class="product-kicker">Unknown route</p>
      <h1>Page not found</h1>
      <p>The requested mobile view is not part of the supported session facade.</p>
      <A class="action action--primary product-back" href="/sessions">
        Return to sessions
      </A>
    </section>
  )
}
