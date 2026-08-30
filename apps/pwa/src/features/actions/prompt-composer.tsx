import {
  assertNever,
  type IdempotencyKey,
  IdempotencyKeySchema,
  PROTOCOL_VERSION,
  PromptRequestSchema,
  PromptTextSchema,
  type SessionId,
} from "@opencode-dispatch/contracts"
import { PaperPlaneTilt } from "phosphor-solid"
import { createEffect, createMemo, createSignal, type JSX, onCleanup } from "solid-js"

import { ActionButton } from "../../ui/action-button"
import { actionFailureFrom, isAbortError } from "./action-error"
import { ActionStatus } from "./action-status"
import type { ActionAvailability, ActionStatusState, RemoteActionClient } from "./types"

type PromptComposerProps = {
  readonly availability: ActionAvailability
  readonly client: RemoteActionClient
  readonly idempotencyKeyFactory?: (() => IdempotencyKey) | undefined
  readonly initialDraft?: string
  readonly sessionId: SessionId
}

type PromptPhase =
  | "accepted"
  | "error"
  | "idle"
  | "offline"
  | "retryable"
  | "revoked"
  | "submitting"

type PromptRequest = ReturnType<typeof PromptRequestSchema.parse>

function defaultIdempotencyKey(): IdempotencyKey {
  return IdempotencyKeySchema.parse(crypto.randomUUID())
}

function promptStatus(phase: PromptPhase, detail: string): ActionStatusState {
  switch (phase) {
    case "accepted":
      return {
        kind: phase,
        label: "Accepted",
        message: "Prompt accepted",
        tone: "success",
      }
    case "error":
      return { kind: phase, label: "Not sent", message: detail, tone: "danger" }
    case "idle":
      return {
        kind: phase,
        label: "Ready",
        message: "Nothing is sent until you submit.",
        tone: "info",
      }
    case "offline":
      return {
        kind: phase,
        label: "Offline",
        message: "The draft stays here until the trusted connection returns.",
        tone: "warning",
      }
    case "retryable":
      return { kind: phase, label: "Not confirmed", message: detail, tone: "warning" }
    case "revoked":
      return {
        kind: phase,
        label: "Revoked",
        message: "Access revoked",
        tone: "danger",
      }
    case "submitting":
      return {
        kind: phase,
        label: "Sending",
        message: "Waiting for the authoritative action response.",
        tone: "warning",
      }
    default:
      return assertNever(phase)
  }
}

export function PromptComposer(props: PromptComposerProps): JSX.Element {
  const [draft, setDraft] = createSignal(props.initialDraft ?? "")
  const [detail, setDetail] = createSignal("")
  const [phase, setPhase] = createSignal<PromptPhase>(
    props.availability === "active" ? "idle" : props.availability,
  )
  const [request, setRequest] = createSignal<PromptRequest>()
  let controller: AbortController | undefined

  createEffect(() => {
    const availability = props.availability
    if (availability === "active") {
      if (phase() === "offline") {
        setPhase("idle")
      }
      return
    }
    controller?.abort()
    setPhase(availability)
  })

  onCleanup(() => controller?.abort())

  const status = createMemo(() => promptStatus(phase(), detail()))
  const busy = (): boolean => phase() === "submitting"
  const canSubmit = (): boolean =>
    props.availability === "active" && !busy() && draft().trim().length > 0
  const actionLabel = (): string => {
    if (props.availability !== "active") return "Send unavailable"
    if (busy()) return "Sending prompt"
    if (phase() === "retryable") return "Retry prompt"
    return "Send prompt"
  }

  const updateDraft = (value: string): void => {
    setDraft(value)
    if (phase() === "accepted" || phase() === "error" || phase() === "retryable") {
      setRequest(undefined)
      setPhase("idle")
      setDetail("")
    }
  }

  const send = async (): Promise<void> => {
    if (!canSubmit()) return

    let current = request()
    if (current === undefined) {
      const text = PromptTextSchema.safeParse(draft())
      if (!text.success || draft().trim().length === 0) {
        setDetail("Enter a prompt within the 32 KiB limit before sending.")
        setPhase("error")
        return
      }
      current = PromptRequestSchema.parse({
        type: "prompt",
        version: PROTOCOL_VERSION,
        sessionId: props.sessionId,
        idempotencyKey: (props.idempotencyKeyFactory ?? defaultIdempotencyKey)(),
        text: text.data,
      })
      setRequest(current)
    }

    const activeController = new AbortController()
    controller = activeController
    setPhase("submitting")
    try {
      const response = await props.client.executeAction(current, activeController.signal)
      if (props.availability !== "active") return
      if (response.type !== "prompt_accepted") {
        throw new TypeError(`Expected prompt_accepted, received ${response.type}`)
      }
      setDraft("")
      setRequest(undefined)
      setPhase("accepted")
    } catch (error) {
      if (props.availability !== "active" || isAbortError(error)) return
      const failure = actionFailureFrom(
        error,
        "Prompt acceptance could not be confirmed. Refresh before trying again.",
      )
      setDetail(failure.message)
      setPhase(failure.retryable ? "retryable" : "error")
    } finally {
      if (controller === activeController) {
        controller = undefined
      }
    }
  }

  return (
    <form
      aria-busy={busy()}
      class="composer stack"
      data-state={phase()}
      data-testid="prompt-composer"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <label for="remote-prompt">Prompt</label>
      <textarea
        aria-describedby="remote-prompt-status"
        aria-invalid={phase() === "error" || phase() === "retryable"}
        disabled={props.availability !== "active" || busy()}
        id="remote-prompt"
        name="remote-prompt"
        onInput={(event) => updateDraft(event.currentTarget.value)}
        placeholder="Add a short, specific instruction"
        rows={3}
        value={draft()}
      />
      <div class="composer__footer cluster">
        <div id="remote-prompt-status">
          <ActionStatus state={status()} />
        </div>
        <ActionButton
          ariaLabel={actionLabel()}
          busy={busy()}
          disabled={!canSubmit()}
          type="submit"
          variant="primary"
        >
          <PaperPlaneTilt aria-hidden="true" size={20} weight="bold" />
          {actionLabel()}
        </ActionButton>
      </div>
    </form>
  )
}
