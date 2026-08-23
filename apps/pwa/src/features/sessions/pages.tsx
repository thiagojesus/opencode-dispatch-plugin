import {
  SessionIdSchema,
  type SessionListResponse,
  type SessionSnapshot,
  type SessionSummary,
} from "@opencode-dispatch/contracts"
import { A, useNavigate, useParams } from "@solidjs/router"
import {
  createEffect,
  createSignal,
  For,
  type JSX,
  Match,
  onCleanup,
  onMount,
  Switch,
} from "solid-js"

import { StatePanel } from "../../ui/continuity"
import { SessionRow, SessionSkeleton, ToolSkeleton } from "../../ui/sessions"
import { browserApi } from "./browser-api"
import { openBrowserEventStream, SessionSynchronizer, type SynchronizerState } from "./synchronizer"
import { TimelineEntry } from "./timeline-entry"

export { TimelineEntry } from "./timeline-entry"

function sessionStatus(session: SessionSummary): "busy" | "idle" | "waiting" {
  if (session.pendingPermissionCount + session.pendingQuestionCount > 0) return "waiting"
  return session.status.type === "idle" ? "idle" : "busy"
}

function useSessionSynchronizer<T extends SessionListResponse | SessionSnapshot>(
  synchronizer: SessionSynchronizer<T>,
) {
  const [state, setState] = createSignal<SynchronizerState<T>>(synchronizer.state)
  const resume = (): void => {
    if (document.visibilityState === "visible") void synchronizer.refresh()
  }
  onMount(() => {
    const unsubscribe = synchronizer.subscribe(setState)
    synchronizer.start()
    document.addEventListener("visibilitychange", resume)
    onCleanup(() => {
      document.removeEventListener("visibilitychange", resume)
      unsubscribe()
      synchronizer.stop()
    })
  })
  return state
}

function StateFailure(props: {
  readonly onRetry: () => void
  readonly state: "error" | "offline" | "revoked"
}): JSX.Element {
  const copy = {
    error: ["Could not load sessions", "The authoritative snapshot could not be verified."],
    offline: [
      "Connection offline",
      "The last verified view is paused until the connection returns.",
    ],
    revoked: ["Access revoked", "Return to the desktop to enable this session again."],
  } as const
  return (
    <StatePanel
      description={copy[props.state][1]}
      kind={props.state}
      title={copy[props.state][0]}
      {...(props.state === "revoked" ? {} : { actionLabel: "Try again", onAction: props.onRetry })}
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
  const snapshot = (): SessionListResponse | undefined => {
    const current = state()
    return current.type === "ready" ? current.snapshot : undefined
  }
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
              state().type === "error" || state().type === "offline" || state().type === "revoked"
            }
          >
            <StateFailure
              onRetry={() => void synchronizer.refresh()}
              state={
                state().type === "revoked"
                  ? "revoked"
                  : state().type === "offline"
                    ? "offline"
                    : "error"
              }
            />
          </Match>
          <Match when={snapshot()?.sessions.length === 0}>
            <StatePanel
              description="Nothing is exposed remotely. Enable a live session from the desktop when you need mobile continuation."
              kind="empty"
              title="No enabled sessions"
            />
          </Match>
          <Match when={snapshot()}>
            {(snapshot) => (
              <For each={snapshot().sessions}>
                {(session) => (
                  <SessionRow
                    onSelect={() => navigate(`/sessions/${encodeURIComponent(session.id)}`)}
                    status={sessionStatus(session)}
                    title={session.title}
                  />
                )}
              </For>
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
  const snapshot = (): SessionSnapshot | undefined => {
    const current = state()
    return current.type === "ready" ? current.snapshot : undefined
  }
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
              state().type === "error" || state().type === "offline" || state().type === "revoked"
            }
          >
            <StateFailure
              onRetry={() => void synchronizer.refresh()}
              state={
                state().type === "revoked"
                  ? "revoked"
                  : state().type === "offline"
                    ? "offline"
                    : "error"
              }
            />
          </Match>
          <Match when={snapshot()}>
            {(snapshot) => (
              <>
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
