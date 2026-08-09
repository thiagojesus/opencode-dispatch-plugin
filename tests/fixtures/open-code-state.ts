import type {
  Message,
  Part,
  PermissionV2Request,
  QuestionV2Request,
  Session,
  SessionStatus,
  Todo,
} from "@opencode-ai/sdk/v2/types"

import type {
  MessageId,
  PermissionRequestId,
  QuestionRequestId,
  SessionId,
} from "../../packages/contracts/src/index.ts"
import { DeterministicClock, DeterministicIds } from "./determinism.ts"

export type OpenCodeCompatibility = "1.18.3" | "latest-compatible"

export type FakeOpenCodeScenario = {
  readonly sessionId: SessionId
  readonly messageId: MessageId
  readonly permissionRequestId: PermissionRequestId
  readonly questionRequestId: QuestionRequestId
  readonly session: Session
  readonly status: SessionStatus
  readonly messages: readonly {
    readonly info: Message
    readonly parts: readonly Part[]
  }[]
  readonly todos: readonly Todo[]
  readonly permissions: readonly PermissionV2Request[]
  readonly questions: readonly QuestionV2Request[]
}

export function createOpenCodeScenario(compatibility: OpenCodeCompatibility): FakeOpenCodeScenario {
  const ids = new DeterministicIds(18)
  const clock = new DeterministicClock(1_700_000_000_000)
  const sessionId = ids.session()
  const messageId = ids.message()
  const permissionRequestId = ids.permission()
  const questionRequestId = ids.question()
  const status = { type: "idle" } satisfies SessionStatus
  const session = {
    id: sessionId,
    slug: "fixture-session",
    projectID: "fixture-project",
    directory: "/fixture/workspace",
    title: "Fixture session",
    version: compatibility,
    time: { created: clock.now(), updated: clock.now() },
  } satisfies Session
  const message = {
    id: messageId,
    sessionID: sessionId,
    role: "user",
    time: { created: clock.now() },
    agent: "fixture-agent",
    model: { providerID: "fixture-provider", modelID: "fixture-model" },
  } satisfies Message
  const part = {
    id: "fixture-part-1",
    sessionID: sessionId,
    messageID: messageId,
    type: "text",
    text: "Fixture transcript",
  } satisfies Part
  const permission = {
    id: permissionRequestId,
    sessionID: sessionId,
    action: "fixture-action",
    resources: ["fixture-resource"],
  } satisfies PermissionV2Request
  const question = {
    id: questionRequestId,
    sessionID: sessionId,
    questions: [
      {
        header: "Fixture",
        question: "Continue the fixture?",
        options: [{ label: "Continue", description: "Continue the deterministic fixture." }],
      },
    ],
  } satisfies QuestionV2Request

  return {
    sessionId,
    messageId,
    permissionRequestId,
    questionRequestId,
    session,
    status,
    messages: [{ info: message, parts: [part] }],
    todos: [{ content: "Exercise fixture", status: "pending", priority: "high" }],
    permissions: [permission],
    questions: [question],
  }
}
