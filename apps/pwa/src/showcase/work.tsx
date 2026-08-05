import { Collapsible } from "@kobalte/core/collapsible"
import {
  CheckCircle,
  CircleDashed,
  PaperPlaneTilt,
  TerminalWindow,
  WarningCircle,
} from "phosphor-solid"
import { createSignal, type JSX } from "solid-js"

import { ActionButton } from "./actions"
import { StateLabel } from "./section"

type ToolState = "complete" | "failed" | "queued" | "running"

type ComposerState = "error" | "offline" | "ready" | "sending"

type ComposerProps = {
  readonly initialDraft?: string
  readonly initialState?: Exclude<ComposerState, "sending">
  readonly label?: string
  readonly testId?: string
}

type ToolCardProps = {
  readonly defaultOpen?: boolean
  readonly output: string
  readonly state: ToolState
  readonly testId?: string
  readonly toolName: string
  readonly triggerLabel?: string
}

const TOOL_STATE_COPY: Record<ToolState, string> = {
  complete: "Complete",
  failed: "Failed safely",
  queued: "Queued",
  running: "Running",
}

const COMPOSER_COPY = {
  error: {
    action: "Retry",
    ariaLabel: "Retry follow-up",
    helper: "Send failed. The draft is preserved and ready to retry.",
  },
  offline: {
    action: "Send unavailable",
    ariaLabel: "Send unavailable while offline",
    helper: "Offline. The draft stays on this device until the trusted connection returns.",
  },
  ready: {
    action: "Send",
    ariaLabel: "Send follow-up",
    helper: "Nothing is sent until you submit.",
  },
  sending: {
    action: "Sending",
    ariaLabel: "Sending follow-up",
    helper: "Sending to the active local session.",
  },
} as const satisfies Record<
  ComposerState,
  { readonly action: string; readonly ariaLabel: string; readonly helper: string }
>

function assertNever(value: never): never {
  throw new TypeError(`Unhandled tool state: ${value}`)
}

function ToolIcon(props: { readonly state: ToolState }): JSX.Element {
  switch (props.state) {
    case "complete":
      return <CheckCircle aria-hidden="true" size={20} weight="bold" />
    case "failed":
      return <WarningCircle aria-hidden="true" size={20} weight="bold" />
    case "queued":
      return <TerminalWindow aria-hidden="true" size={20} weight="bold" />
    case "running":
      return <CircleDashed aria-hidden="true" size={20} weight="bold" />
    default:
      return assertNever(props.state)
  }
}

export function ToolCard(props: ToolCardProps): JSX.Element {
  return (
    <Collapsible class="tool-card" defaultOpen={props.defaultOpen ?? false}>
      <div class="tool-card__summary">
        <span class="icon-well icon-well--small">
          <ToolIcon state={props.state} />
        </span>
        <span class="tool-card__copy">
          <strong>{props.toolName}</strong>
          <span>{TOOL_STATE_COPY[props.state]}</span>
        </span>
        <Collapsible.Trigger class="action action--ghost">
          {props.triggerLabel ?? "Show output"}
        </Collapsible.Trigger>
      </div>
      <Collapsible.Content class="tool-card__output" data-testid={props.testId}>
        <pre>
          <code>{props.output}</code>
        </pre>
      </Collapsible.Content>
    </Collapsible>
  )
}

export function Composer(props: ComposerProps): JSX.Element {
  const testId = props.testId ?? "composer-interactive"
  const fieldId = `${testId}-message`
  const [draft, setDraft] = createSignal(props.initialDraft ?? "")
  const [state, setState] = createSignal<ComposerState>(props.initialState ?? "ready")
  const copy = () => COMPOSER_COPY[state()]
  const sending = () => state() === "sending"
  const offline = () => state() === "offline"

  return (
    <form
      aria-busy={sending()}
      class="composer stack"
      data-state={state()}
      data-testid={testId}
      onSubmit={(event) => {
        event.preventDefault()
        if (!offline()) {
          setState("sending")
        }
      }}
    >
      <label for={fieldId}>{props.label ?? "Follow-up message"}</label>
      <textarea
        aria-describedby={`${fieldId}-status`}
        aria-invalid={state() === "error"}
        disabled={offline() || sending()}
        id={fieldId}
        name={fieldId}
        onInput={(event) => setDraft(event.currentTarget.value)}
        placeholder="Add a short, specific instruction"
        rows={3}
        value={draft()}
      />
      <div class="composer__footer cluster">
        <span
          aria-live={state() === "error" ? "assertive" : "polite"}
          class="helper-text"
          data-tone={state() === "error" ? "danger" : undefined}
          id={`${fieldId}-status`}
          role={state() === "error" ? "alert" : "status"}
        >
          {copy().helper}
        </span>
        <ActionButton
          ariaLabel={copy().ariaLabel}
          busy={sending()}
          disabled={offline()}
          type="submit"
          variant="primary"
        >
          <PaperPlaneTilt aria-hidden="true" size={20} weight="bold" />
          {copy().action}
        </ActionButton>
      </div>
    </form>
  )
}

export function WorkShowcase(): JSX.Element {
  const longOutput =
    "workspace/packages/dispatch/continuation/authoritative-snapshot/" +
    "event-boundary-without-an-untrusted-breakpoint"

  return (
    <div class="split-grid">
      <div class="primitive-card stack">
        <h3>Tool card states</h3>
        <ToolCard
          output="Waiting for an available local worker."
          state="queued"
          toolName="typecheck"
        />
        <ToolCard output="Checking the bounded workspace now." state="running" toolName="inspect" />
        <ToolCard output="No contract violations found." state="complete" toolName="validate" />
        <ToolCard
          output="The request stopped before any local mutation."
          state="failed"
          toolName="apply"
        />
        <ToolCard
          output={longOutput}
          state="complete"
          testId="tool-output-long"
          toolName="path audit"
          triggerLabel="Inspect tool output"
        />
      </div>
      <div class="primitive-card stack">
        <h3>Composer states</h3>
        <div class="stack">
          <StateLabel>Empty and ready</StateLabel>
          <Composer />
        </div>
        <div class="stack">
          <StateLabel tone="warning">Offline and disabled</StateLabel>
          <Composer
            initialDraft="Preserve this draft until the trusted connection returns."
            initialState="offline"
            label="Offline follow-up message"
            testId="composer-offline"
          />
        </div>
        <div class="stack">
          <StateLabel tone="danger">Send failed with draft preserved</StateLabel>
          <Composer
            initialDraft="Summarize the failed check without replaying it."
            initialState="error"
            label="Failed follow-up message"
            testId="composer-error"
          />
        </div>
      </div>
    </div>
  )
}
