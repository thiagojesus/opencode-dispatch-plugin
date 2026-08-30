import type { QuestionRequest } from "@opencode-dispatch/contracts"
import { For, type JSX, Show } from "solid-js"

type AnswerMatrix = readonly (readonly string[])[]

type QuestionFieldsProps = {
  readonly customAnswers: readonly string[]
  readonly disabled: boolean
  readonly invalidQuestions: ReadonlySet<number>
  readonly onChooseOption: (questionIndex: number, value: string, multiple: boolean) => void
  readonly onCustomAnswer: (questionIndex: number, value: string, multiple: boolean) => void
  readonly questions: QuestionRequest["questions"]
  readonly requestId: QuestionRequest["id"]
  readonly selectedAnswers: AnswerMatrix
}

export function QuestionFields(props: QuestionFieldsProps): JSX.Element {
  return (
    <div class="question-list stack">
      <For each={props.questions}>
        {(question, questionIndex) => {
          const index = questionIndex()
          const errorId = `question-${index}-error`
          return (
            <fieldset disabled={props.disabled}>
              <legend>
                <strong>{question.header}</strong>
                <span>{question.question}</span>
              </legend>
              <For each={question.options}>
                {(option, optionIndex) => {
                  const inputId = `question-${index}-option-${optionIndex()}`
                  const descriptionId = `${inputId}-description`
                  const selected = (): boolean =>
                    (props.selectedAnswers[index] ?? []).includes(option.label)
                  return (
                    <label class="choice" for={inputId}>
                      <input
                        aria-describedby={`${descriptionId}${props.invalidQuestions.has(index) ? ` ${errorId}` : ""}`}
                        aria-invalid={props.invalidQuestions.has(index)}
                        checked={selected()}
                        id={inputId}
                        name={`question-${props.requestId}-${index}`}
                        onChange={() =>
                          props.onChooseOption(index, option.label, question.multiple)
                        }
                        type={question.multiple ? "checkbox" : "radio"}
                        value={option.label}
                      />
                      <span class="choice__copy">
                        <strong>{option.label}</strong>
                        <span id={descriptionId}>{option.description}</span>
                      </span>
                    </label>
                  )
                }}
              </For>
              <Show when={question.custom}>
                <label for={`question-${index}-custom`}>Custom answer for {question.header}</label>
                <textarea
                  aria-describedby={props.invalidQuestions.has(index) ? errorId : undefined}
                  aria-invalid={props.invalidQuestions.has(index)}
                  id={`question-${index}-custom`}
                  onInput={(event) =>
                    props.onCustomAnswer(index, event.currentTarget.value, question.multiple)
                  }
                  rows={3}
                  value={props.customAnswers[index] ?? ""}
                />
              </Show>
              <Show when={props.invalidQuestions.has(index)}>
                <p class="helper-text" data-tone="danger" id={errorId} role="alert">
                  Answer this question before submitting.
                </p>
              </Show>
            </fieldset>
          )
        }}
      </For>
    </div>
  )
}
