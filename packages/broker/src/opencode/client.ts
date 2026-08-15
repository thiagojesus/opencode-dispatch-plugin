import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2/client"
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
  PermissionDecision,
  PermissionRequestId,
  PromptText,
  QuestionReplyAnswers,
  QuestionRequestId,
  SessionId,
} from "@opencode-dispatch/contracts"

import { type BasicAuthorization, BasicAuthorizationSchema } from "./auth.ts"
import { OpenCodeAdapterError, upstreamErrorForStatus } from "./errors.ts"

export type OpenCodeMessage = {
  readonly info: Message
  readonly parts: readonly Part[]
}

export type OpenCodeProcessClientInput = {
  readonly authorization?: BasicAuthorization
  readonly serverUrl: string
}

type SdkResult<T> = {
  readonly data: T | undefined
  readonly error: unknown
  readonly response: Response
}

function dataFrom<T>(result: SdkResult<T>): T {
  if (!result.response.ok || result.error !== undefined) {
    throw upstreamErrorForStatus(result.response.status)
  }
  if (result.data === undefined) {
    throw new OpenCodeAdapterError("response_invalid")
  }
  return result.data
}

function successFrom(result: SdkResult<unknown>): void {
  if (!result.response.ok || result.error !== undefined) {
    throw upstreamErrorForStatus(result.response.status)
  }
}

async function requestData<T>(request: () => Promise<SdkResult<T>>): Promise<T> {
  try {
    return dataFrom(await request())
  } catch (error) {
    if (error instanceof OpenCodeAdapterError) throw error
    throw new OpenCodeAdapterError("upstream_failure")
  }
}

async function requestSuccess(request: () => Promise<SdkResult<unknown>>): Promise<void> {
  try {
    successFrom(await request())
  } catch (error) {
    if (error instanceof OpenCodeAdapterError) throw error
    throw new OpenCodeAdapterError("upstream_failure")
  }
}

export class OpenCodeProcessClient {
  readonly #client: OpencodeClient

  constructor(input: OpenCodeProcessClientInput) {
    const authorization =
      input.authorization === undefined
        ? undefined
        : BasicAuthorizationSchema.parse(input.authorization)
    this.#client = createOpencodeClient(
      authorization === undefined
        ? { baseUrl: input.serverUrl }
        : { baseUrl: input.serverUrl, headers: { authorization } },
    )
  }

  statuses(): Promise<Record<string, SessionStatus>> {
    return requestData(() => this.#client.session.status())
  }

  get(sessionId: SessionId): Promise<Session> {
    return requestData(() => this.#client.session.get({ sessionID: sessionId }))
  }

  messages(sessionId: SessionId): Promise<readonly OpenCodeMessage[]> {
    return requestData(() => this.#client.session.messages({ sessionID: sessionId }))
  }

  async status(sessionId: SessionId): Promise<SessionStatus> {
    const statuses = await this.statuses()
    const status = statuses[sessionId]
    if (status === undefined) throw new OpenCodeAdapterError("upstream_not_found")
    return status
  }

  todos(sessionId: SessionId): Promise<readonly Todo[]> {
    return requestData(() => this.#client.session.todo({ sessionID: sessionId }))
  }

  async permissions(sessionId: SessionId): Promise<readonly PermissionV2Request[]> {
    const response = await requestData(() =>
      this.#client.v2.session.permission.list({ sessionID: sessionId }),
    )
    return response.data
  }

  async questions(sessionId: SessionId): Promise<readonly QuestionV2Request[]> {
    const response = await requestData(() =>
      this.#client.v2.session.question.list({ sessionID: sessionId }),
    )
    return response.data
  }

  promptAsync(sessionId: SessionId, text: PromptText): Promise<void> {
    return requestSuccess(() =>
      this.#client.session.promptAsync({
        sessionID: sessionId,
        parts: [{ type: "text", text }],
      }),
    )
  }

  async abort(sessionId: SessionId): Promise<boolean> {
    return requestData(() => this.#client.session.abort({ sessionID: sessionId }))
  }

  replyPermission(
    sessionId: SessionId,
    requestId: PermissionRequestId,
    decision: PermissionDecision,
  ): Promise<void> {
    return requestSuccess(() =>
      this.#client.v2.session.permission.reply({
        sessionID: sessionId,
        requestID: requestId,
        reply: decision,
      }),
    )
  }

  replyQuestion(
    sessionId: SessionId,
    requestId: QuestionRequestId,
    answers: QuestionReplyAnswers,
  ): Promise<void> {
    return requestSuccess(() =>
      this.#client.v2.session.question.reply({
        sessionID: sessionId,
        requestID: requestId,
        questionV2Reply: { answers: answers.map((answer) => [...answer]) },
      }),
    )
  }
}

export function createOpenCodeProcessClient(
  input: OpenCodeProcessClientInput,
): OpenCodeProcessClient {
  return new OpenCodeProcessClient(input)
}
