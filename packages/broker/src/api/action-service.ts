import {
  assertNever,
  PROTOCOL_VERSION,
  type RemoteActionRequest,
  RemoteActionRequestSchema,
  type RemoteActionResponse,
  RemoteActionResponseSchema,
  type TransportIdentity,
} from "@opencode-dispatch/contracts"

import type { SessionAuthority, SessionAuthorityContext } from "./authority.ts"
import { ApiHttpError, apiErrorFrom } from "./errors.ts"
import { BoundedIdempotencyCache, IdempotencyCapacityError } from "./idempotency.ts"
import { normalizePermissions, normalizeQuestions } from "./normalize.ts"
import type { ApiOpenCodePort } from "./ports.ts"

type ActionServiceOptions = {
  readonly authority: SessionAuthority
  readonly now: () => number
  readonly openCode: ApiOpenCodePort
}

type ActionOutcome =
  | { readonly ok: true; readonly response: RemoteActionResponse }
  | { readonly ok: false; readonly error: ApiHttpError }

export class SessionActionService {
  readonly #authority: SessionAuthority
  readonly #cache: BoundedIdempotencyCache<ActionOutcome>
  readonly #now: () => number
  readonly #openCode: ApiOpenCodePort

  constructor(options: ActionServiceOptions) {
    this.#authority = options.authority
    this.#now = options.now
    this.#openCode = options.openCode
    this.#cache = new BoundedIdempotencyCache({
      maxEntries: 1_024,
      now: options.now,
      ttlMs: 5 * 60_000,
    })
  }

  async execute(identity: TransportIdentity, value: unknown): Promise<RemoteActionResponse> {
    const action = RemoteActionRequestSchema.parse(value)
    const context = this.#authority.require(action.sessionId)
    switch (action.type) {
      case "prompt":
        return this.#prompt(identity, context, action)
      case "abort":
        return this.#abort(context)
      case "permission_reply":
        return this.#permission(context, action)
      case "question_reply":
        return this.#question(context, action)
      default:
        return assertNever(action)
    }
  }

  async #prompt(
    identity: TransportIdentity,
    context: SessionAuthorityContext,
    action: Extract<RemoteActionRequest, { readonly type: "prompt" }>,
  ): Promise<RemoteActionResponse> {
    const key = [
      identity.login,
      context.processNonce,
      context.sessionId,
      action.idempotencyKey,
    ].join("\n")
    let cached: Awaited<ReturnType<BoundedIdempotencyCache<ActionOutcome>["run"]>>
    try {
      cached = await this.#cache.run(key, async () => {
        try {
          await this.#openCode.promptAsync(context.sessionId, action.text)
          this.#authority.assertCurrent(context)
          return {
            ok: true,
            response: RemoteActionResponseSchema.parse({
              type: "prompt_accepted",
              version: PROTOCOL_VERSION,
              sessionId: context.sessionId,
              idempotencyKey: action.idempotencyKey,
              acceptedAt: this.#now(),
              duplicate: false,
            }),
          }
        } catch (error) {
          return { ok: false, error: apiErrorFrom(error) }
        }
      })
    } catch (error) {
      if (error instanceof IdempotencyCapacityError) throw new ApiHttpError("RATE_LIMITED")
      throw error
    }
    if (!cached.value.ok) throw cached.value.error
    return cached.duplicate
      ? RemoteActionResponseSchema.parse({ ...cached.value.response, duplicate: true })
      : cached.value.response
  }

  async #abort(context: SessionAuthorityContext): Promise<RemoteActionResponse> {
    const accepted = await this.#openCode.abort(context.sessionId)
    this.#authority.assertCurrent(context)
    if (!accepted) throw new ApiHttpError("PENDING_ACTION_STALE")
    return RemoteActionResponseSchema.parse({
      type: "abort_accepted",
      version: PROTOCOL_VERSION,
      sessionId: context.sessionId,
      acceptedAt: this.#now(),
    })
  }

  async #permission(
    context: SessionAuthorityContext,
    action: Extract<RemoteActionRequest, { readonly type: "permission_reply" }>,
  ): Promise<RemoteActionResponse> {
    const pending = normalizePermissions(
      await this.#openCode.permissions(context.sessionId),
      context.sessionId,
    )
    if (!pending.some((request) => request.id === action.requestId)) {
      throw new ApiHttpError("PENDING_ACTION_STALE")
    }
    await this.#openCode.replyPermission(context.sessionId, action.requestId, action.decision)
    this.#authority.assertCurrent(context)
    return RemoteActionResponseSchema.parse({
      type: "permission_reply_accepted",
      version: PROTOCOL_VERSION,
      sessionId: context.sessionId,
      requestId: action.requestId,
      decision: action.decision,
    })
  }

  async #question(
    context: SessionAuthorityContext,
    action: Extract<RemoteActionRequest, { readonly type: "question_reply" }>,
  ): Promise<RemoteActionResponse> {
    const pending = normalizeQuestions(
      await this.#openCode.questions(context.sessionId),
      context.sessionId,
    )
    const request = pending.find((candidate) => candidate.id === action.requestId)
    if (request === undefined || request.questions.length !== action.answers.length) {
      throw new ApiHttpError("PENDING_ACTION_STALE")
    }
    await this.#openCode.replyQuestion(context.sessionId, action.requestId, action.answers)
    this.#authority.assertCurrent(context)
    return RemoteActionResponseSchema.parse({
      type: "question_reply_accepted",
      version: PROTOCOL_VERSION,
      sessionId: context.sessionId,
      requestId: action.requestId,
    })
  }
}
