import {
  assertNever,
  PROTOCOL_VERSION,
  QuestionReplyAnswersSchema,
  QuestionReplyRequestSchema,
  type QuestionRequest,
  type SessionId,
} from "@opencode-dispatch/contracts"
import { Question } from "phosphor-solid"
import { createEffect, createMemo, createSignal, type JSX, onCleanup } from "solid-js"

import { ActionButton } from "../../ui/action-button"
import { actionFailureFrom, isAbortError } from "./action-error"
import { ActionStatus } from "./action-status"
import { QuestionFields } from "./question-fields"
import type { ActionAvailability, ActionStatusState, RemoteActionClient } from "./types"

type QuestionCardProps = {
  readonly availability: ActionAvailability
  readonly client: RemoteActionClient
  readonly request: QuestionRequest
  readonly sessionId: SessionId
}

type QuestionPhase = "accepted" | "error" | "idle" | "offline" | "revoked" | "submitting"
type AnswerMatrix = readonly (readonly string[])[]

function questionStatus(phase: QuestionPhase, detail: string): ActionStatusState {
  switch (phase) {
    case "accepted":
      return { kind: phase, label: "Accepted", message: "Answers accepted", tone: "success" }
    case "error":
      return { kind: phase, label: "Still pending", message: detail, tone: "danger" }
    case "idle":
      return {
        kind: phase,
        label: "Unanswered",
        message: "Answer every question before submitting.",
        tone: "warning",
      }
    case "offline":
      return {
        kind: phase,
        label: "Offline",
        message: "Answers cannot be submitted until the trusted connection returns.",
        tone: "warning",
      }
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
        label: "Submitting",
        message: "Waiting for the authoritative question response.",
        tone: "warning",
      }
    default:
      return assertNever(phase)
  }
}

function emptyMatrix(length: number): AnswerMatrix {
  return Array.from({ length }, () => [])
}

export function QuestionCard(props: QuestionCardProps): JSX.Element {
  const [customAnswers, setCustomAnswers] = createSignal<readonly string[]>(
    Array.from({ length: props.request.questions.length }, () => ""),
  )
  const [detail, setDetail] = createSignal("")
  const [invalidQuestions, setInvalidQuestions] = createSignal<ReadonlySet<number>>(new Set())
  const [phase, setPhase] = createSignal<QuestionPhase>(
    props.availability === "active" ? "idle" : props.availability,
  )
  const [selectedAnswers, setSelectedAnswers] = createSignal<AnswerMatrix>(
    emptyMatrix(props.request.questions.length),
  )
  let controller: AbortController | undefined

  createEffect(() => {
    if (props.availability === "active") return
    controller?.abort()
    setPhase(props.availability)
  })

  onCleanup(() => controller?.abort())

  const status = createMemo(() => questionStatus(phase(), detail()))
  const busy = (): boolean => phase() === "submitting"
  const disabled = (): boolean =>
    props.availability !== "active" || busy() || phase() === "accepted"

  const clearInvalid = (questionIndex: number): void => {
    if (!invalidQuestions().has(questionIndex)) return
    setInvalidQuestions(new Set([...invalidQuestions()].filter((index) => index !== questionIndex)))
  }

  const chooseOption = (questionIndex: number, value: string, multiple: boolean): void => {
    setSelectedAnswers((current) =>
      current.map((answers, index) => {
        if (index !== questionIndex) return answers
        if (!multiple) return [value]
        return answers.includes(value)
          ? answers.filter((answer) => answer !== value)
          : [...answers, value]
      }),
    )
    if (!multiple) {
      setCustomAnswers((current) =>
        current.map((answer, index) => (index === questionIndex ? "" : answer)),
      )
    }
    clearInvalid(questionIndex)
  }

  const updateCustomAnswer = (questionIndex: number, value: string, multiple: boolean): void => {
    setCustomAnswers((current) =>
      current.map((answer, index) => (index === questionIndex ? value : answer)),
    )
    if (!multiple && value.trim().length > 0) {
      setSelectedAnswers((current) =>
        current.map((answers, index) => (index === questionIndex ? [] : answers)),
      )
    }
    clearInvalid(questionIndex)
  }

  const answers = (): AnswerMatrix =>
    props.request.questions.map((question, index) => {
      const selected = selectedAnswers()[index] ?? []
      const custom = customAnswers()[index]?.trim() ?? ""
      return question.custom && custom.length > 0 ? [...selected, custom] : selected
    })

  const submit = async (): Promise<void> => {
    if (disabled()) return
    const parsedAnswers = QuestionReplyAnswersSchema.safeParse(answers())
    if (!parsedAnswers.success) {
      const invalid = new Set<number>()
      for (const [index, answer] of answers().entries()) {
        if (answer.length === 0) invalid.add(index)
      }
      setInvalidQuestions(invalid)
      setDetail("Answer every question before submitting.")
      setPhase("error")
      return
    }

    const activeController = new AbortController()
    controller = activeController
    setPhase("submitting")
    try {
      const response = await props.client.executeAction(
        QuestionReplyRequestSchema.parse({
          type: "question_reply",
          version: PROTOCOL_VERSION,
          sessionId: props.sessionId,
          requestId: props.request.id,
          answers: parsedAnswers.data,
        }),
        activeController.signal,
      )
      if (props.availability !== "active") return
      if (response.type !== "question_reply_accepted" || response.requestId !== props.request.id) {
        throw new TypeError("Question response did not match the pending request")
      }
      setPhase("accepted")
    } catch (error) {
      if (props.availability !== "active" || isAbortError(error)) return
      const failure = actionFailureFrom(
        error,
        "Answer acceptance could not be confirmed. Refresh the pending question.",
      )
      setDetail(failure.message)
      setPhase("error")
    } finally {
      if (controller === activeController) {
        controller = undefined
      }
    }
  }

  return (
    <form
      class="decision-card stack"
      data-testid="question-card"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div class="decision-card__heading cluster">
        <span class="icon-well">
          <Question aria-hidden="true" size={24} weight="bold" />
        </span>
        <div class="stack">
          <h3>Question requested</h3>
          <p>The local operation remains pending until every answer is accepted.</p>
        </div>
      </div>
      <QuestionFields
        customAnswers={customAnswers()}
        disabled={disabled()}
        invalidQuestions={invalidQuestions()}
        onChooseOption={chooseOption}
        onCustomAnswer={updateCustomAnswer}
        questions={props.request.questions}
        requestId={props.request.id}
        selectedAnswers={selectedAnswers()}
      />
      <ActionStatus state={status()} />
      <ActionButton busy={busy()} disabled={disabled()} type="submit" variant="primary">
        {busy() ? "Submitting answers" : "Submit answers"}
      </ActionButton>
    </form>
  )
}
