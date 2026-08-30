import {
  assertNever,
  PermissionRequestSchema,
  QuestionRequestSchema,
  type RemoteActionRequest,
  RemoteActionResponseSchema,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"
import { type JSX, onMount } from "solid-js"

import { ShowcaseSection } from "../../showcase/section"
import { AbortControl } from "./abort-control"
import { PermissionCard } from "./permission-card"
import { PromptComposer } from "./prompt-composer"
import { QuestionCard } from "./question-card"
import { SafeMarkdown } from "./safe-markdown"
import type { RemoteActionClient } from "./types"

const SESSION_ID = SessionIdSchema.parse("session.action-showcase")
const ACCEPTED_AT = 1_787_457_600_000

const QUESTION_REQUEST = QuestionRequestSchema.parse({
  id: "question.intervention",
  questions: [
    {
      header: "Direction",
      question: "How should the local agent continue?",
      options: [
        { label: "Continue", description: "Keep the current bounded approach." },
        { label: "Stop", description: "Return without another mutation." },
      ],
      multiple: false,
      custom: false,
    },
    {
      header: "Checks",
      question: "Which independent checks should run?",
      options: [
        { label: "Type checks", description: "Verify strict TypeScript." },
        { label: "Accessibility", description: "Verify keyboard and screen-reader behavior." },
      ],
      multiple: true,
      custom: false,
    },
    {
      header: "Constraint",
      question: "What additional constraint should apply?",
      options: [{ label: "No change", description: "Continue without another constraint." }],
      multiple: false,
      custom: true,
    },
  ],
})

const ALLOW_PERMISSION = PermissionRequestSchema.parse({
  id: "permission.allow.once",
  action: "read",
  resources: ["apps/pwa/src/features/actions/"],
  source: { messageId: "message.allow", callId: "call.allow" },
})

const REJECT_PERMISSION = PermissionRequestSchema.parse({
  id: "permission.reject",
  action: "write",
  resources: ["apps/pwa/src/features/actions/prompt-composer.tsx"],
  source: { messageId: "message.reject", callId: "call.reject" },
})

function acceptedResponse(
  request: RemoteActionRequest,
): ReturnType<typeof RemoteActionResponseSchema.parse> {
  switch (request.type) {
    case "prompt":
      return RemoteActionResponseSchema.parse({
        type: "prompt_accepted",
        version: request.version,
        sessionId: request.sessionId,
        idempotencyKey: request.idempotencyKey,
        acceptedAt: ACCEPTED_AT,
        duplicate: false,
      })
    case "abort":
      return RemoteActionResponseSchema.parse({
        type: "abort_accepted",
        version: request.version,
        sessionId: request.sessionId,
        acceptedAt: ACCEPTED_AT,
      })
    case "permission_reply":
      return RemoteActionResponseSchema.parse({
        type: "permission_reply_accepted",
        version: request.version,
        sessionId: request.sessionId,
        requestId: request.requestId,
        decision: request.decision,
      })
    case "question_reply":
      return RemoteActionResponseSchema.parse({
        type: "question_reply_accepted",
        version: request.version,
        sessionId: request.sessionId,
        requestId: request.requestId,
      })
    default:
      return assertNever(request)
  }
}

const SHOWCASE_CLIENT: RemoteActionClient = {
  async executeAction(request, signal) {
    await Promise.resolve()
    if (signal.aborted) {
      throw new DOMException("Action aborted", "AbortError")
    }
    return acceptedResponse(request)
  },
}

const MODEL_MARKDOWN = `<script>window.dispatchCompromised = true</script>

[unsafe reference](javascript:alert(1)) and [safe reference](https://example.com/docs)

\`\`\`ts
const accepted = true
\`\`\``

export function ActionFlowShowcasePage(): JSX.Element {
  const focusMain = (): void => document.getElementById("action-flow-main")?.focus()

  onMount(() => {
    document.title = "OpenCode Dispatch Intervention Flows"
  })

  return (
    <div class="showcase-document" data-testid="action-flow-showcase">
      <button class="skip-link" data-testid="skip-link" onClick={focusMain} type="button">
        Skip to intervention controls
      </button>
      <header class="showcase-header content-limiter stack">
        <p class="showcase-kicker">Production primitives / authoritative outcomes</p>
        <h1>Remote intervention flows</h1>
        <p class="showcase-lead">
          Text-only actions stay pending until the trusted local process accepts them.
        </p>
      </header>
      <main class="content-limiter stack" id="action-flow-main" tabindex="-1">
        <ShowcaseSection
          description="The original prompt and idempotency key remain stable until acceptance is authoritative."
          id="remote-prompt-flow"
          title="Send a bounded prompt"
        >
          <PromptComposer availability="active" client={SHOWCASE_CLIENT} sessionId={SESSION_ID} />
        </ShowcaseSection>
        <ShowcaseSection
          description="Single, multiple, and custom answers preserve contract order in one semantic form."
          id="remote-question-flow"
          title="Answer pending questions"
          tone="muted"
        >
          <QuestionCard
            availability="active"
            client={SHOWCASE_CLIENT}
            request={QUESTION_REQUEST}
            sessionId={SESSION_ID}
          />
        </ShowcaseSection>
        <ShowcaseSection
          description="Exact capabilities and resources precede either a one-time approval or explicit rejection."
          id="remote-permission-flow"
          title="Decide scoped permissions"
        >
          <div class="split-grid">
            <div class="stack" data-testid="permission-allow-once">
              <PermissionCard
                availability="active"
                client={SHOWCASE_CLIENT}
                request={ALLOW_PERMISSION}
                sessionId={SESSION_ID}
                workActive={false}
              />
            </div>
            <div class="stack" data-testid="permission-reject">
              <PermissionCard
                availability="active"
                client={SHOWCASE_CLIENT}
                request={REJECT_PERMISSION}
                sessionId={SESSION_ID}
                workActive={true}
              />
            </div>
          </div>
        </ShowcaseSection>
        <ShowcaseSection
          description="Stopping active work requires a focus-managed confirmation and an authoritative response."
          id="remote-abort-flow"
          title="Abort active work"
          tone="muted"
        >
          <AbortControl availability="active" client={SHOWCASE_CLIENT} sessionId={SESSION_ID} />
        </ShowcaseSection>
        <ShowcaseSection
          description="Raw HTML and unsafe URLs are dropped; explicit external links and plain code remain useful."
          id="safe-model-output"
          title="Read safe model output"
        >
          <div class="primitive-card stack" data-testid="safe-model-markdown">
            <SafeMarkdown source={MODEL_MARKDOWN} />
          </div>
        </ShowcaseSection>
      </main>
      <footer class="showcase-footer content-limiter">
        <p>Interactive fixture only. No live session data or remote process is connected here.</p>
      </footer>
    </div>
  )
}
