import { describe, expect, test } from "bun:test"

import {
  MAX_PAGE_SIZE,
  MAX_PUBLIC_PAYLOAD_BYTES,
  PaginationRequestSchema,
  SessionListResponseSchema,
  SessionPendingActionsResponseSchema,
  SessionSnapshotSchema,
  SessionStatusResponseSchema,
  SessionStatusSchema,
  SessionTodosResponseSchema,
  TimelineItemSchema,
  TodoItemSchema,
} from "./index.ts"

const BROKER_EPOCH = "550e8400-e29b-41d4-a716-446655440002"
const NOW = 1_754_352_000_000

const sessionSummary = {
  id: "ses_contracts",
  title: "Contract session",
  status: { type: "busy" },
  enabledAt: NOW,
  updatedAt: NOW,
  pendingPermissionCount: 1,
  pendingQuestionCount: 1,
}

const completeSnapshot = {
  type: "session_snapshot",
  version: 1,
  brokerEpoch: BROKER_EPOCH,
  sequence: 4,
  session: sessionSummary,
  timeline: [
    {
      type: "user_message",
      messageId: "msg_user",
      text: "Continue the task.",
      createdAt: NOW,
    },
    {
      type: "assistant_text",
      messageId: "msg_assistant",
      partId: "part_text",
      text: "Working on it.",
      phase: "streaming",
    },
    {
      type: "assistant_reasoning",
      messageId: "msg_assistant",
      partId: "part_reasoning",
      text: "Checking the contract.",
      phase: "complete",
    },
    {
      type: "tool",
      messageId: "msg_assistant",
      partId: "part_tool",
      callId: "call_test",
      name: "bash",
      state: { status: "completed", title: "Run tests", output: "12 pass" },
    },
  ],
  todos: [{ content: "Define contracts", status: "in_progress", priority: "high" }],
  pendingPermissions: [
    {
      id: "perm_contracts",
      action: "bash",
      resources: ["bun test packages/contracts"],
      source: { messageId: "msg_assistant", callId: "call_test" },
    },
  ],
  pendingQuestions: [
    {
      id: "question_contracts",
      questions: [
        {
          header: "Release",
          question: "Ship this change?",
          options: [{ label: "Ship", description: "Create the scoped commit" }],
          multiple: false,
          custom: true,
        },
      ],
    },
  ],
}

describe("session response contracts", () => {
  test("round-trips a complete enabled-session snapshot without unknown fields", () => {
    const givenSnapshot = completeSnapshot

    const parsedSnapshot = SessionSnapshotSchema.parse(givenSnapshot)
    const serializedSnapshot = JSON.stringify(parsedSnapshot)
    const roundTrippedSnapshot = SessionSnapshotSchema.parse(JSON.parse(serializedSnapshot))

    expect(roundTrippedSnapshot).toEqual(parsedSnapshot)
  })

  test("parses a versioned authoritative status response", () => {
    const givenResponse = {
      type: "session_status",
      version: 1,
      brokerEpoch: BROKER_EPOCH,
      sequence: 4,
      sessionId: "ses_contracts",
      status: { type: "busy" },
    }

    const parsedResponse = SessionStatusResponseSchema.parse(givenResponse)

    expect(JSON.stringify(parsedResponse)).toBe(JSON.stringify(givenResponse))
  })

  test("parses a versioned bounded todo response", () => {
    const givenResponse = {
      type: "session_todos",
      version: 1,
      brokerEpoch: BROKER_EPOCH,
      sequence: 4,
      sessionId: "ses_contracts",
      todos: [{ content: "Define contracts", status: "completed", priority: "high" }],
    }

    const parsedResponse = SessionTodosResponseSchema.parse(givenResponse)

    expect(JSON.stringify(parsedResponse)).toBe(JSON.stringify(givenResponse))
  })

  test("parses versioned pending permission and question responses", () => {
    const givenResponse = {
      type: "session_pending_actions",
      version: 1,
      brokerEpoch: BROKER_EPOCH,
      sequence: 4,
      sessionId: "ses_contracts",
      pendingPermissions: completeSnapshot.pendingPermissions,
      pendingQuestions: completeSnapshot.pendingQuestions,
    }

    const parsedResponse = SessionPendingActionsResponseSchema.parse(givenResponse)

    expect(parsedResponse.pendingPermissions).toHaveLength(1)
    expect(parsedResponse.pendingQuestions).toHaveLength(1)
  })

  test("rejects a snapshot response larger than 1 MiB", () => {
    const givenSnapshot = {
      ...completeSnapshot,
      timeline: [
        {
          type: "user_message",
          messageId: "msg_large",
          text: "a".repeat(MAX_PUBLIC_PAYLOAD_BYTES),
          createdAt: NOW,
        },
      ],
    }

    const parsedSnapshot = SessionSnapshotSchema.safeParse(givenSnapshot)

    expect(parsedSnapshot.success).toBe(false)
  })

  test("applies bounded pagination defaults", () => {
    const givenPagination = {}

    const parsedPagination = PaginationRequestSchema.parse(givenPagination)

    expect(parsedPagination).toEqual({ limit: 50 })
  })

  test("accepts the maximum page size", () => {
    const givenPagination = { limit: MAX_PAGE_SIZE }

    const parsedPagination = PaginationRequestSchema.parse(givenPagination)

    expect(parsedPagination.limit).toBe(MAX_PAGE_SIZE)
  })

  test("rejects a page size above the maximum", () => {
    const givenPagination = { limit: MAX_PAGE_SIZE + 1 }

    const parsedPagination = PaginationRequestSchema.safeParse(givenPagination)

    expect(parsedPagination.success).toBe(false)
  })

  test("rejects a session page containing more than the bounded maximum", () => {
    const givenPage = {
      type: "session_list",
      version: 1,
      brokerEpoch: BROKER_EPOCH,
      sequence: 4,
      sessions: Array.from({ length: MAX_PAGE_SIZE + 1 }, () => sessionSummary),
    }

    const parsedPage = SessionListResponseSchema.safeParse(givenPage)

    expect(parsedPage.success).toBe(false)
  })

  test("rejects an unknown session status discriminator", () => {
    const givenStatus = { type: "completed" }

    const parsedStatus = SessionStatusSchema.safeParse(givenStatus)

    expect(parsedStatus.success).toBe(false)
  })

  test("rejects an unknown timeline discriminator", () => {
    const givenTimelineItem = { type: "file", path: "/private/project" }

    const parsedTimelineItem = TimelineItemSchema.safeParse(givenTimelineItem)

    expect(parsedTimelineItem.success).toBe(false)
  })

  test("rejects an undocumented todo status", () => {
    const givenTodo = { content: "Define contracts", status: "blocked", priority: "high" }

    const parsedTodo = TodoItemSchema.safeParse(givenTodo)

    expect(parsedTodo.success).toBe(false)
  })

  test("rejects unknown nested snapshot fields", () => {
    const givenSnapshot = {
      ...completeSnapshot,
      session: { ...sessionSummary, directory: "/private/project" },
    }

    const parsedSnapshot = SessionSnapshotSchema.safeParse(givenSnapshot)

    expect(parsedSnapshot.success).toBe(false)
  })
})
