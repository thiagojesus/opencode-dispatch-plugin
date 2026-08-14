import type { JSX } from "solid-js"

import {
  SessionRow,
  SessionSkeleton,
  ToolSkeleton,
  TranscriptPart,
  TranscriptSkeleton,
} from "../ui/sessions"

export { SessionRow, SessionSkeleton, TranscriptPart } from "../ui/sessions"

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
        <SessionSkeleton showcaseVariant="skeleton-session-row" />
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
        <TranscriptSkeleton showcaseVariant="skeleton-transcript-part" />
        <ToolSkeleton showcaseVariant="skeleton-tool-card" />
      </div>
    </div>
  )
}
