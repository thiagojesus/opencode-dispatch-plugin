import { CheckCircle, LockKey, Question, ShieldWarning } from "phosphor-solid"
import { createSignal, type JSX, Show } from "solid-js"

import { ActionButton } from "./actions"
import { StateLabel } from "./section"

export function QuestionCard(): JSX.Element {
  const [answered, setAnswered] = createSignal(false)
  const [choice, setChoice] = createSignal<"keep" | "stop" | null>(null)
  const [hasError, setHasError] = createSignal(false)

  const choose = (nextChoice: "keep" | "stop"): void => {
    setChoice(nextChoice)
    setHasError(false)
  }

  return (
    <form
      class="decision-card stack"
      data-showcase-variant="question-single-choice"
      data-testid="question-interactive"
      onSubmit={(event) => {
        event.preventDefault()
        if (choice() === null) {
          setHasError(true)
          return
        }
        setAnswered(true)
      }}
    >
      <div class="decision-card__heading cluster">
        <span class="icon-well">
          <Question aria-hidden="true" size={24} weight="bold" />
        </span>
        <div class="stack">
          <h3>Continue waiting for the local check?</h3>
          <p>The current operation remains active until you answer.</p>
        </div>
      </div>
      <fieldset disabled={answered()}>
        <legend>Choose the next step</legend>
        <label class="choice" for="keep-waiting">
          <input
            aria-describedby={hasError() ? "wait-choice-error" : undefined}
            aria-invalid={hasError()}
            id="keep-waiting"
            name="wait-choice"
            onChange={() => choose("keep")}
            type="radio"
            value="keep"
          />
          <span>Keep waiting</span>
        </label>
        <label class="choice" for="stop-waiting">
          <input
            aria-describedby={hasError() ? "wait-choice-error" : undefined}
            aria-invalid={hasError()}
            id="stop-waiting"
            name="wait-choice"
            onChange={() => choose("stop")}
            type="radio"
            value="stop"
          />
          <span>Stop and return</span>
        </label>
      </fieldset>
      <Show when={hasError()}>
        <p class="helper-text" data-tone="danger" id="wait-choice-error" role="alert">
          Choose one answer before submitting.
        </p>
      </Show>
      <div class="cluster decision-card__footer">
        <StateLabel tone={answered() ? "success" : "warning"}>
          {answered() ? "Answered" : "Unanswered"}
        </StateLabel>
        <ActionButton disabled={answered()} type="submit" variant="primary">
          Submit answer
        </ActionButton>
      </div>
    </form>
  )
}

function MultipleChoiceQuestion(): JSX.Element {
  return (
    <form class="decision-card stack" data-showcase-variant="question-multiple-choice">
      <div class="decision-card__heading cluster">
        <span class="icon-well">
          <Question aria-hidden="true" size={24} weight="bold" />
        </span>
        <div class="stack">
          <h3>Which checks should run next?</h3>
          <p>Select every independent check that is safe to continue.</p>
        </div>
      </div>
      <fieldset>
        <legend>Choose one or more checks</legend>
        <label class="choice" for="check-types">
          <input id="check-types" name="next-checks" type="checkbox" />
          <span>Type checks</span>
        </label>
        <label class="choice" for="check-tests">
          <input id="check-tests" name="next-checks" type="checkbox" />
          <span>Focused tests</span>
        </label>
      </fieldset>
      <ActionButton type="submit" variant="primary">
        Run selected checks
      </ActionButton>
    </form>
  )
}

function FreeResponseQuestion(): JSX.Element {
  return (
    <form class="decision-card stack" data-showcase-variant="question-free-response">
      <div class="decision-card__heading cluster">
        <span class="icon-well">
          <Question aria-hidden="true" size={24} weight="bold" />
        </span>
        <div class="stack">
          <h3>What should change before continuing?</h3>
          <p>Give the local agent one short, specific constraint.</p>
        </div>
      </div>
      <label for="question-response">Required change</label>
      <textarea id="question-response" name="question-response" rows={3} />
      <ActionButton type="submit" variant="primary">
        Submit response
      </ActionButton>
    </form>
  )
}

type PermissionDecision = "approved" | "pending" | "rejected"

const PERMISSION_PRESENTATION = {
  approved: { disabled: true, label: "Approved once", tone: "success" },
  pending: { disabled: false, label: "Pending decision", tone: "warning" },
  rejected: { disabled: true, label: "Rejected", tone: "danger" },
} as const satisfies Record<
  PermissionDecision,
  {
    readonly disabled: boolean
    readonly label: string
    readonly tone: "danger" | "success" | "warning"
  }
>

export function PermissionCard(): JSX.Element {
  const [decision, setDecision] = createSignal<PermissionDecision>("pending")
  const presentation = () => PERMISSION_PRESENTATION[decision()]

  return (
    <article class="decision-card stack" data-testid="permission-interactive">
      <div class="decision-card__heading cluster">
        <span class="icon-well">
          <LockKey aria-hidden="true" size={24} weight="bold" />
        </span>
        <div class="stack">
          <h3>Permission requested</h3>
          <p>Allow one write inside the current project workspace.</p>
        </div>
      </div>
      <dl class="scope-list">
        <div>
          <dt>Capability</dt>
          <dd>Write one project file</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>Current workspace only</dd>
        </div>
      </dl>
      <div aria-live="polite" class="cluster decision-card__footer">
        <StateLabel tone={presentation().tone}>{presentation().label}</StateLabel>
        <ActionButton
          disabled={presentation().disabled}
          onClick={() => setDecision("approved")}
          variant="primary"
        >
          Approve once
        </ActionButton>
        <ActionButton
          disabled={presentation().disabled}
          onClick={() => setDecision("rejected")}
          variant="danger"
        >
          Reject
        </ActionButton>
      </div>
    </article>
  )
}

export function DecisionShowcase(): JSX.Element {
  return (
    <div class="split-grid">
      <QuestionCard />
      <MultipleChoiceQuestion />
      <FreeResponseQuestion />
      <PermissionCard />
      <article class="decision-card stack">
        <div class="decision-card__heading cluster">
          <span class="icon-well">
            <CheckCircle aria-hidden="true" size={24} weight="bold" />
          </span>
          <div class="stack">
            <h3>Answered and recorded locally</h3>
            <p>The choice was accepted once and the card is now read-only.</p>
          </div>
        </div>
        <StateLabel tone="success">Answered</StateLabel>
      </article>
      <article class="decision-card stack">
        <div class="decision-card__heading cluster">
          <span class="icon-well">
            <ShieldWarning aria-hidden="true" size={24} weight="bold" />
          </span>
          <div class="stack">
            <h3>Permission expired</h3>
            <p>The request is no longer actionable. Refresh the session before deciding.</p>
          </div>
        </div>
        <StateLabel tone="danger">Expired</StateLabel>
      </article>
    </div>
  )
}
