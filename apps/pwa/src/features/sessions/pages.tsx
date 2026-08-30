import {
  SessionIdSchema,
  type SessionListResponse,
  type SessionSnapshot,
  type SessionSummary,
} from "@opencode-dispatch/contracts"
import { A, useNavigate, useParams } from "@solidjs/router"
import { createEffect, For, type JSX, Match, onCleanup, onMount, Show, Switch } from "solid-js"

import { StatePanel } from "../../ui/continuity"
import { SessionRow, SessionSkeleton, ToolSkeleton } from "../../ui/sessions"
import { browserApi } from "./browser-api"
import { openBrowserEventStream, SessionSynchronizer, type SynchronizerState } from "./synchronizer"
import { TimelineEntry } from "./timeline-entry"
import { useSessionSynchronizer } from "./use-session-synchronizer"

export { TimelineEntry } from "./timeline-entry"

function sessionStatus(session: SessionSummary): "busy" | "idle" | "waiting" {
  if (session.pendingPermissionCount + session.pendingQuestionCount > 0) return "waiting"
  return session.status.type === "idle" ? "idle" : "busy"
}

function retainedSnapshot<T extends SessionListResponse | SessionSnapshot>(
  state: SynchronizerState<T>,
): T | undefined {
  switch (state.type) {
    case "ready":
    case "offline":
    case "reconnecting":
      return state.snapshot
    case "error":
    case "loading":
    case "revoked":
      return undefined
  }
}

function StateFailure(props: {
  readonly onRetry: () => void
  readonly state: "error" | "offline" | "reconnecting" | "revoked"
}): JSX.Element {
  const copy = {
    error: ["Could not load sessions", "The authoritative snapshot could not be verified."],
    offline: [
      "Connection offline",
      "The last verified view is paused until the connection returns.",
    ],
    reconnecting: [
      "Reconnecting",
      "Checking a fresh authoritative snapshot before live updates resume.",
    ],
    revoked: ["Access revoked", "Return to the desktop to enable this session again."],
  } as const
  return (
    <StatePanel
      description={copy[props.state][1]}
      kind={props.state}
      title={copy[props.state][0]}
      {...(props.state === "revoked" || props.state === "reconnecting"
        ? {}
        : { actionLabel: "Try again", onAction: props.onRetry })}
    />
  )
}

export function SessionsPage(): JSX.Element {
  const navigate = useNavigate()
  const synchronizer = new SessionSynchronizer({
    load: (signal) => browserApi.listSessions({ limit: 100 }, signal),
    openStream: (position, onFrame, onClose) =>
      openBrowserEventStream({ type: "sessions" }, position, onFrame, onClose),
  })
  const state = useSessionSynchronizer(synchronizer)
  const snapshot = (): SessionListResponse | undefined => retainedSnapshot(state())
  return (
    <section class="product-route product-list-detail" data-mobile-route="list">
      <section class="session-pane session-pane--list stack" data-testid="session-list-pane">
        <header class="product-route__heading stack">
          <p class="product-kicker">Local availability</p>
          <h1>Enabled sessions</h1>
          <p>Only sessions explicitly enabled on the desktop can appear on this trusted device.</p>
        </header>
        <Switch>
          <Match when={state().type === "loading"}>
            <SessionSkeleton />
            <SessionSkeleton />
          </Match>
          <Match
            when={
              state().type === "error" ||
              state().type === "revoked" ||
              ((state().type === "offline" || state().type === "reconnecting") &&
                snapshot() === undefined)
            }
          >
            <StateFailure
              onRetry={() => void synchronizer.refresh()}
              state={
                state().type === "revoked"
                  ? "revoked"
                  : state().type === "reconnecting"
                    ? "reconnecting"
                    : state().type === "offline"
                      ? "offline"
                      : "error"
              }
            />
          </Match>
          <Match when={state().type === "ready" && snapshot()?.sessions.length === 0}>
            <StatePanel
              description="Nothing is exposed remotely. Enable a live session from the desktop when you need mobile continuation."
              kind="empty"
              title="No enabled sessions"
            />
          </Match>
          <Match when={snapshot()}>
            {(snapshot) => (
              <>
                <Show when={state().type === "offline" || state().type === "reconnecting"}>
                  <StateFailure
                    onRetry={() => void synchronizer.refresh()}
                    state={state().type === "offline" ? "offline" : "reconnecting"}
                  />
                </Show>
                <For each={snapshot().sessions}>
                  {(session) => (
                    <SessionRow
                      disabled={state().type !== "ready"}
                      onSelect={() => navigate(`/sessions/${encodeURIComponent(session.id)}`)}
                      status={state().type === "offline" ? "offline" : sessionStatus(session)}
                      title={session.title}
                    />
                  )}
                </For>
              </>
            )}
          </Match>
        </Switch>
      </section>
      <aside aria-label="Session detail" class="session-pane session-pane--detail stack">
        <p class="product-kicker">Session detail</p>
        <h2>Select an enabled session</h2>
        <p>The latest authoritative snapshot opens here without storing transcript data.</p>
      </aside>
    </section>
  )
}

export function SessionDetailPage(): JSX.Element {
  const params = useParams<{ sessionId: string }>()
  const sessionId = SessionIdSchema.safeParse(params.sessionId)
  if (!sessionId.success) return <StateFailure onRetry={() => undefined} state="error" />
  const synchronizer = new SessionSynchronizer({
    load: (signal) => browserApi.sessionSnapshot(sessionId.data, signal),
    openStream: (position, onFrame, onClose) =>
      openBrowserEventStream(
        { type: "session", sessionId: sessionId.data },
        position,
        onFrame,
        onClose,
      ),
  })
  const state = useSessionSynchronizer(synchronizer)
  const snapshot = (): SessionSnapshot | undefined => retainedSnapshot(state())
  let transcript: HTMLElement | undefined
  let autoFollow = true
  const updateFollow = (): void => {
    const owner = transcript?.closest<HTMLElement>("[data-scroll-owner]")
    if (owner !== null && owner !== undefined) {
      autoFollow = owner.scrollHeight - owner.scrollTop - owner.clientHeight <= 24
    }
  }
  createEffect(() => {
    const length = snapshot()?.timeline.length ?? 0
    if (length > 0 && autoFollow) queueMicrotask(() => transcript?.scrollIntoView({ block: "end" }))
  })
  onMount(() => {
    const owner = transcript?.closest<HTMLElement>("[data-scroll-owner]")
    owner?.addEventListener("scroll", updateFollow, { passive: true })
    onCleanup(() => owner?.removeEventListener("scroll", updateFollow))
  })
  return (
    <section class="product-route product-list-detail" data-mobile-route="detail">
      <aside aria-label="Enabled sessions" class="session-pane session-pane--list stack">
        <h2>Enabled sessions</h2>
        <A class="action action--ghost product-back" href="/sessions">
          Return to session list
        </A>
      </aside>
      <section class="session-pane session-pane--detail stack" data-testid="session-detail-pane">
        <A class="action action--ghost product-back" href="/sessions">
          Back to sessions
        </A>
        <Switch>
          <Match when={state().type === "loading"}>
            <SessionSkeleton />
            <ToolSkeleton />
          </Match>
          <Match
            when={
              state().type === "error" ||
              state().type === "revoked" ||
              ((state().type === "offline" || state().type === "reconnecting") &&
                snapshot() === undefined)
            }
          >
            <StateFailure
              onRetry={() => void synchronizer.refresh()}
              state={
                state().type === "revoked"
                  ? "revoked"
                  : state().type === "reconnecting"
                    ? "reconnecting"
                    : state().type === "offline"
                      ? "offline"
                      : "error"
              }
            />
          </Match>
          <Match when={snapshot()}>
            {(snapshot) => (
              <>
                <Show when={state().type === "offline" || state().type === "reconnecting"}>
                  <StateFailure
                    onRetry={() => void synchronizer.refresh()}
                    state={state().type === "offline" ? "offline" : "reconnecting"}
                  />
                </Show>
                <header class="product-route__heading stack">
                  <p class="product-kicker">Authoritative snapshot</p>
                  <h1>{snapshot().session.title}</h1>
                  <p>{snapshot().session.status.type === "idle" ? "Ready" : "Working"}</p>
                </header>
                <section
                  aria-label="Session transcript"
                  class="stack"
                  ref={(element) => {
                    transcript = element
                  }}
                >
                  <For each={snapshot().timeline}>{(item) => <TimelineEntry item={item} />}</For>
                </section>
              </>
            )}
          </Match>
        </Switch>
      </section>
    </section>
  )
}
