import { createSignal, type JSX, onCleanup, onMount, Show } from "solid-js"

import { ActionFlowShowcasePage } from "../features/actions/action-flow-showcase"
import { ActionShowcase } from "./actions"
import { AppShellShowcase } from "./app-shell"
import { ContinuityRail, StatePanel } from "./continuity"
import { DecisionShowcase } from "./decisions"
import { FeedbackShowcase } from "./feedback"
import { ShowcaseSection } from "./section"
import { SessionShowcase } from "./sessions"
import { WorkShowcase } from "./work"

type StressMode = "error" | "long" | "none" | "offline" | "rtl"

function parseStressMode(): StressMode {
  switch (new URLSearchParams(window.location.search).get("stress")) {
    case "error":
      return "error"
    case "long":
      return "long"
    case "offline":
      return "offline"
    case "rtl":
      return "rtl"
    default:
      return "none"
  }
}

function PrimitiveShowcaseApp(): JSX.Element {
  const [online, setOnline] = createSignal(navigator.onLine)
  const stressMode = parseStressMode()

  const markOnline = (): void => {
    setOnline(true)
  }
  const markOffline = (): void => {
    setOnline(false)
  }
  const focusMain = (): void => document.getElementById("showcase-main")?.focus()

  onMount(() => {
    document.title = "OpenCode Dispatch Design System"
    window.addEventListener("online", markOnline)
    window.addEventListener("offline", markOffline)
  })

  onCleanup(() => {
    window.removeEventListener("online", markOnline)
    window.removeEventListener("offline", markOffline)
  })

  return (
    <div class="showcase-document">
      <button class="skip-link" data-testid="skip-link" onClick={focusMain} type="button">
        Skip to primitive showcase
      </button>
      <Show when={!online()}>
        <div class="network-banner" data-testid="network-offline" role="status">
          Offline. The installed showcase shell is available without a network connection.
        </div>
      </Show>
      <header class="showcase-header content-limiter stack">
        <p class="showcase-kicker">Design system / primitive gate</p>
        <h1>Continue with confidence.</h1>
        <p class="showcase-lead">
          A live, accessible component contract for calm mobile intervention in explicitly enabled
          OpenCode sessions.
        </p>
        <ul class="showcase-principles cluster" aria-label="Design principles">
          <li>Visible continuity</li>
          <li>One-handed action</li>
          <li>Failure without ambiguity</li>
        </ul>
      </header>
      <main class="content-limiter stack" id="showcase-main" tabindex="-1">
        <Show when={stressMode === "long"}>
          <div class="stress-panel" data-testid="stress-string">
            workspace/packages/dispatch/authoritative-snapshot-without-a-breakpoint/
            reconnect-before-replaying-live-events-and-never-duplicate-a-remote-action
          </div>
        </Show>
        <Show when={stressMode === "rtl"}>
          <div class="stress-panel" data-testid="stress-rtl" dir="rtl" lang="ar">
            متابعة جلسة التطوير بعد استعادة الاتصال الموثوق، مع الحفاظ على ترتيب الإجراءات وعدم
            تكرار أي طلب بعيد.
          </div>
        </Show>
        <Show when={stressMode === "offline"}>
          <StatePanel
            actionLabel="Retry connection"
            description="The trusted connection is unavailable. No remote action can be sent."
            kind="offline"
            testId="stress-offline"
            title="Offline"
          />
        </Show>
        <Show when={stressMode === "error"}>
          <StatePanel
            actionLabel="Try again"
            description="The last trusted snapshot remains unchanged while recovery is attempted."
            kind="error"
            testId="stress-error"
            title="Could not load the current state"
          />
        </Show>

        <ShowcaseSection
          description="A bounded shell names every fixed region and gives the transcript one explicit scroll owner."
          id="app-shell"
          title="App shell"
        >
          <AppShellShowcase />
        </ShowcaseSection>

        <ShowcaseSection
          description="Every connection state pairs a distinct icon, plain label, consequence, and recovery path."
          id="continuity"
          title="Continuity rail"
          tone="muted"
        >
          <div class="continuity-matrix">
            <ContinuityRail kind="enabled" />
            <ContinuityRail kind="connected" testId="continuity-connected" />
            <ContinuityRail kind="reconnecting" />
            <ContinuityRail
              kind="offline"
              recovery={{ label: "Retry", onAction: () => undefined }}
              testId="continuity-offline"
            />
            <ContinuityRail
              kind="revoked"
              recovery={{
                label: "Learn why",
                onAction: () => undefined,
                variant: "secondary",
              }}
              testId="continuity-revoked"
            />
          </div>
        </ShowcaseSection>

        <ShowcaseSection
          description="Primary, secondary, quiet, destructive, loading, disabled, and icon-only actions share one tactile geometry."
          id="actions"
          title="Action controls"
        >
          <ActionShowcase />
        </ShowcaseSection>

        <ShowcaseSection
          description="Session identity and transcript meaning remain legible when content grows or live work changes state."
          id="session-transcript"
          title="Sessions and transcript"
          tone="muted"
        >
          <SessionShowcase />
        </ShowcaseSection>

        <ShowcaseSection
          description="Tool output is disclosed on demand, while the composer keeps sending and recovery state explicit."
          id="work-controls"
          title="Tools and composer"
        >
          <WorkShowcase />
        </ShowcaseSection>

        <ShowcaseSection
          description="Questions and permissions put scope before action and never offer a permanent approval."
          id="decisions"
          title="Decision cards"
          tone="muted"
        >
          <DecisionShowcase />
        </ShowcaseSection>

        <ShowcaseSection
          description="Blocking danger stays in a focus-managed dialog; routine outcomes use polite transient feedback."
          id="feedback"
          title="Confirmation and feedback"
        >
          <FeedbackShowcase />
        </ShowcaseSection>

        <ShowcaseSection
          description="Empty, error, offline, and revoked surfaces state what happened, what it means, and what remains possible."
          id="recovery"
          title="Recovery states"
          tone="muted"
        >
          <div class="intrinsic-grid">
            <StatePanel
              actionLabel="Enable a session"
              description="Nothing is exposed remotely until a local session is enabled."
              kind="empty"
              title="No enabled sessions"
            />
            <StatePanel
              actionLabel="Start a message"
              description="This enabled session has no transcript yet. Send the first message when ready."
              kind="empty"
              showcaseVariant="state-empty-transcript"
              title="No transcript yet"
            />
            <StatePanel
              actionLabel="Try again"
              description="The current snapshot could not be loaded. No action was sent."
              kind="error"
              title="Could not load state"
            />
            <StatePanel
              actionLabel="Retry connection"
              description="Updates are paused until the trusted connection returns."
              kind="offline"
              title="Connection offline"
            />
            <StatePanel
              description="Return to the desktop to explicitly enable remote access again."
              kind="revoked"
              title="Access revoked"
            />
          </div>
        </ShowcaseSection>
      </main>
      <footer class="showcase-footer content-limiter">
        <p>Primitive showcase only. No live session data or remote actions are connected here.</p>
      </footer>
    </div>
  )
}

export function ShowcaseApp(): JSX.Element {
  return new URLSearchParams(window.location.search).get("fixture") === "actions" ? (
    <ActionFlowShowcasePage />
  ) : (
    <PrimitiveShowcaseApp />
  )
}
