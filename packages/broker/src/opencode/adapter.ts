import {
  LoopbackServerUrlSchema,
  type PermissionDecision,
  PermissionDecisionSchema,
  type PermissionRequestId,
  PermissionRequestIdSchema,
  type ProcessInstanceNonce,
  ProcessInstanceNonceSchema,
  PromptTextSchema,
  type QuestionReplyAnswers,
  QuestionReplyAnswersSchema,
  type QuestionRequestId,
  QuestionRequestIdSchema,
  type SessionId,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"

import { type BasicAuthorization, BasicAuthorizationSchema } from "./auth.ts"
import {
  createOpenCodeProcessClient,
  type OpenCodeMessage,
  type OpenCodeProcessClient,
} from "./client.ts"
import { OpenCodeAdapterError } from "./errors.ts"
import {
  createOpenCodeStatusSeed,
  type OpenCodeSessionSignal,
  OpenCodeSessionSignalSchema,
} from "./events.ts"

type ProcessRegistration = {
  readonly authorization?: unknown
  readonly processNonce: unknown
  readonly serverUrl: unknown
}

type OwnershipClaim = {
  readonly processNonce: ProcessInstanceNonce
  readonly sequence: number
  readonly signal: OpenCodeSessionSignal
}

export class OpenCodeAdapter {
  readonly #claims = new Map<SessionId, Map<ProcessInstanceNonce, OwnershipClaim>>()
  readonly #invalidatedAt = new Map<SessionId, number>()
  readonly #targets = new Map<ProcessInstanceNonce, OpenCodeProcessClient>()
  #sequence = 0

  registerProcess(input: ProcessRegistration): void {
    const processNonce = ProcessInstanceNonceSchema.parse(input.processNonce)
    const serverUrl = LoopbackServerUrlSchema.safeParse(input.serverUrl)
    if (!serverUrl.success) throw new OpenCodeAdapterError("server_url_invalid")
    const authorization =
      input.authorization === undefined
        ? undefined
        : BasicAuthorizationSchema.safeParse(input.authorization)
    if (authorization !== undefined && !authorization.success) {
      throw new OpenCodeAdapterError("authorization_invalid")
    }
    const clientInput: { readonly authorization?: BasicAuthorization; readonly serverUrl: string } =
      authorization?.success === true
        ? { authorization: authorization.data, serverUrl: serverUrl.data }
        : { serverUrl: serverUrl.data }
    this.#targets.set(processNonce, createOpenCodeProcessClient(clientInput))
  }

  unregisterProcess(processNonce: unknown): void {
    const parsedNonce = ProcessInstanceNonceSchema.parse(processNonce)
    this.#targets.delete(parsedNonce)
    for (const [sessionId, claims] of this.#claims) {
      if (claims.delete(parsedNonce)) {
        this.#invalidatedAt.set(sessionId, this.#sequence)
      }
      if (claims.size === 0) this.#claims.delete(sessionId)
    }
  }

  async seedStatuses(processNonce: unknown, observedAt: unknown): Promise<void> {
    const parsedNonce = ProcessInstanceNonceSchema.parse(processNonce)
    const statuses = await this.#target(parsedNonce).statuses()
    for (const sessionId of Object.keys(statuses)) {
      const parsedSessionId = SessionIdSchema.safeParse(sessionId)
      if (!parsedSessionId.success) throw new OpenCodeAdapterError("response_invalid")
      this.observe(parsedNonce, createOpenCodeStatusSeed(parsedSessionId.data, observedAt))
    }
  }

  observe(processNonce: unknown, signal: unknown): void {
    const parsedNonce = ProcessInstanceNonceSchema.parse(processNonce)
    this.#target(parsedNonce)
    const parsedSignal = OpenCodeSessionSignalSchema.parse(signal)
    this.#sequence += 1
    const claims = this.#claims.get(parsedSignal.sessionId) ?? new Map()
    claims.set(parsedNonce, {
      processNonce: parsedNonce,
      sequence: this.#sequence,
      signal: parsedSignal,
    })
    this.#claims.set(parsedSignal.sessionId, claims)
  }

  resolveOwner(sessionId: unknown): ProcessInstanceNonce {
    const parsedSessionId = SessionIdSchema.parse(sessionId)
    const invalidatedAt = this.#invalidatedAt.get(parsedSessionId) ?? -1
    const claims = [...(this.#claims.get(parsedSessionId)?.values() ?? [])].filter(
      (claim) => this.#targets.has(claim.processNonce) && claim.sequence > invalidatedAt,
    )
    const live = claims.filter((claim) => claim.signal.source === "live")
    if (live.length > 0) {
      const latestObservedAt = Math.max(...live.map((claim) => claim.signal.observedAt))
      const latest = live.filter((claim) => claim.signal.observedAt === latestObservedAt)
      if (latest.length !== 1) throw new OpenCodeAdapterError("ownership_ambiguous")
      const owner = latest[0]
      if (owner === undefined) throw new OpenCodeAdapterError("ownership_ambiguous")
      return owner.processNonce
    }
    if (claims.length === 1) {
      const owner = claims[0]
      if (owner === undefined) throw new OpenCodeAdapterError("ownership_missing")
      return owner.processNonce
    }
    if (claims.length > 1) throw new OpenCodeAdapterError("ownership_ambiguous")
    throw new OpenCodeAdapterError("ownership_missing")
  }

  sessionIds(): readonly SessionId[] {
    return [...this.#claims.keys()].sort()
  }

  get(sessionId: unknown) {
    return this.#clientFor(sessionId).get(SessionIdSchema.parse(sessionId))
  }

  messages(sessionId: unknown): Promise<readonly OpenCodeMessage[]> {
    return this.#clientFor(sessionId).messages(SessionIdSchema.parse(sessionId))
  }

  status(sessionId: unknown) {
    return this.#clientFor(sessionId).status(SessionIdSchema.parse(sessionId))
  }

  todos(sessionId: unknown) {
    return this.#clientFor(sessionId).todos(SessionIdSchema.parse(sessionId))
  }

  permissions(sessionId: unknown) {
    return this.#clientFor(sessionId).permissions(SessionIdSchema.parse(sessionId))
  }

  questions(sessionId: unknown) {
    return this.#clientFor(sessionId).questions(SessionIdSchema.parse(sessionId))
  }

  promptAsync(sessionId: unknown, text: unknown): Promise<void> {
    return this.#clientFor(sessionId).promptAsync(
      SessionIdSchema.parse(sessionId),
      PromptTextSchema.parse(text),
    )
  }

  abort(sessionId: unknown): Promise<boolean> {
    return this.#clientFor(sessionId).abort(SessionIdSchema.parse(sessionId))
  }

  replyPermission(sessionId: unknown, requestId: unknown, decision: unknown): Promise<void> {
    return this.#clientFor(sessionId).replyPermission(
      SessionIdSchema.parse(sessionId),
      PermissionRequestIdSchema.parse(requestId),
      PermissionDecisionSchema.parse(decision),
    )
  }

  replyQuestion(sessionId: unknown, requestId: unknown, answers: unknown): Promise<void> {
    return this.#clientFor(sessionId).replyQuestion(
      SessionIdSchema.parse(sessionId),
      QuestionRequestIdSchema.parse(requestId),
      QuestionReplyAnswersSchema.parse(answers),
    )
  }

  dispose(): void {
    this.#targets.clear()
    this.#claims.clear()
    this.#invalidatedAt.clear()
  }

  #clientFor(sessionId: unknown): OpenCodeProcessClient {
    return this.#target(this.resolveOwner(sessionId))
  }

  #target(processNonce: ProcessInstanceNonce): OpenCodeProcessClient {
    const target = this.#targets.get(processNonce)
    if (target === undefined) throw new OpenCodeAdapterError("process_unavailable")
    return target
  }
}

export type { PermissionDecision, PermissionRequestId, QuestionReplyAnswers, QuestionRequestId }
