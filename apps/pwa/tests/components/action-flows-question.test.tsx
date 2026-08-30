import {
  type QuestionRequest,
  QuestionRequestSchema,
  RemoteActionResponseSchema,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library"
import { afterEach, expect, test } from "vitest"

import { QuestionCard, type RemoteActionClient } from "../../src/features/actions"

const SESSION_ID = SessionIdSchema.parse("session.alpha")
const QUESTION_REQUEST: QuestionRequest = QuestionRequestSchema.parse({
  id: "question.next",
  questions: [
    {
      header: "Direction",
      question: "How should the local agent continue?",
      options: [
        { label: "Continue", description: "Keep the current approach." },
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
        { label: "Accessibility", description: "Verify keyboard and axe behavior." },
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

afterEach(() => {
  cleanup()
})

test("submits single, multiple, and custom question answers in contract order", async () => {
  // Given
  const requests: Parameters<RemoteActionClient["executeAction"]>[0][] = []
  const client: RemoteActionClient = {
    async executeAction(request) {
      requests.push(request)
      return RemoteActionResponseSchema.parse({
        type: "question_reply_accepted",
        version: 1,
        sessionId: SESSION_ID,
        requestId: QUESTION_REQUEST.id,
      })
    },
  }
  const rendered = render(() => (
    <QuestionCard
      availability="active"
      client={client}
      request={QUESTION_REQUEST}
      sessionId={SESSION_ID}
    />
  ))

  // When
  fireEvent.click(rendered.getByRole("radio", { name: /^Continue\b/u }))
  fireEvent.click(rendered.getByRole("checkbox", { name: /Type checks/u }))
  fireEvent.click(rendered.getByRole("checkbox", { name: /Accessibility/u }))
  fireEvent.input(rendered.getByRole("textbox", { name: "Custom answer for Constraint" }), {
    target: { value: "Use readonly output." },
  })
  fireEvent.click(rendered.getByRole("button", { name: "Submit answers" }))

  // Then
  await waitFor(() => expect(rendered.getByText("Answers accepted")).toBeDefined())
  expect(requests).toHaveLength(1)
  expect(requests.at(0)).toMatchObject({
    type: "question_reply",
    requestId: QUESTION_REQUEST.id,
    answers: [["Continue"], ["Type checks", "Accessibility"], ["Use readonly output."]],
  })
})
