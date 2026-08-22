import {
  PaginationCursorSchema,
  type PaginationRequest,
  PaginationRequestSchema,
  PROTOCOL_VERSION,
  type ProcessExposure,
  type SessionId,
  SessionListResponseSchema,
  SessionMessagesResponseSchema,
  SessionPendingActionsResponseSchema,
  SessionSnapshotSchema,
  SessionStatusResponseSchema,
  type SessionSummary,
  SessionTodosResponseSchema,
} from "@opencode-dispatch/contracts"
import type { SessionAuthority } from "./authority.ts"
import { ApiHttpError } from "./errors.ts"
import {
  normalizePermissions,
  normalizeQuestions,
  normalizeSession,
  normalizeStatus,
  normalizeTodos,
} from "./normalize.ts"
import { normalizeTimeline } from "./normalize-timeline.ts"
import type { ApiClusterPort, ApiOpenCodePort } from "./ports.ts"

type ReadServiceOptions = {
  readonly authority: SessionAuthority
  readonly cluster: ApiClusterPort
  readonly openCode: ApiOpenCodePort
}

function pageOffset(request: PaginationRequest): number {
  if (request.cursor === undefined) return 0
  if (!/^(0|[1-9][0-9]*)$/u.test(request.cursor)) throw new ApiHttpError("REQUEST_INVALID")
  const offset = Number(request.cursor)
  if (!Number.isSafeInteger(offset)) throw new ApiHttpError("REQUEST_INVALID")
  return offset
}

function nextCursor(offset: number, count: number, total: number) {
  const nextOffset = offset + count
  return nextOffset < total ? PaginationCursorSchema.parse(String(nextOffset)) : undefined
}

function parsePagination(value: unknown): PaginationRequest {
  const parsed = PaginationRequestSchema.safeParse(value)
  if (!parsed.success) throw new ApiHttpError("REQUEST_INVALID")
  return parsed.data
}

export class SessionReadService {
  readonly #authority: SessionAuthority
  readonly #cluster: ApiClusterPort
  readonly #openCode: ApiOpenCodePort

  constructor(options: ReadServiceOptions) {
    this.#authority = options.authority
    this.#cluster = options.cluster
    this.#openCode = options.openCode
  }

  async list(request: unknown) {
    const pagination = parsePagination(request)
    const summaries: SessionSummary[] = []
    for (const exposure of this.#authority.enabledExposures()) {
      summaries.push(await this.#summary(exposure))
    }
    summaries.sort((left, right) => left.id.localeCompare(right.id))
    const offset = pageOffset(pagination)
    if (offset > summaries.length) throw new ApiHttpError("REQUEST_INVALID")
    const sessions = summaries.slice(offset, offset + pagination.limit)
    const cursor = nextCursor(offset, sessions.length, summaries.length)
    return SessionListResponseSchema.parse({
      type: "session_list",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#cluster.snapshot().brokerEpoch,
      sequence: 0,
      sessions,
      ...(cursor === undefined ? {} : { nextCursor: cursor }),
    })
  }

  async snapshot(sessionId: unknown) {
    const context = this.#authority.require(sessionId)
    const [session, messages, status, todos, permissions, questions] = await Promise.all([
      this.#openCode.get(context.sessionId),
      this.#openCode.messages(context.sessionId),
      this.#openCode.status(context.sessionId),
      this.#openCode.todos(context.sessionId),
      this.#openCode.permissions(context.sessionId),
      this.#openCode.questions(context.sessionId),
    ])
    this.#authority.assertCurrent(context)
    const normalizedSession = normalizeSession(session)
    return SessionSnapshotSchema.parse({
      type: "session_snapshot",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#cluster.snapshot().brokerEpoch,
      sequence: 0,
      session: {
        id: context.sessionId,
        title: normalizedSession.title,
        status: normalizeStatus(status),
        enabledAt: context.exposure.enabledAt,
        updatedAt: normalizedSession.updatedAt,
        pendingPermissionCount: normalizePermissions(permissions, context.sessionId).length,
        pendingQuestionCount: normalizeQuestions(questions, context.sessionId).length,
      },
      timeline: normalizeTimeline(messages),
      todos: normalizeTodos(todos),
      pendingPermissions: normalizePermissions(permissions, context.sessionId),
      pendingQuestions: normalizeQuestions(questions, context.sessionId),
    })
  }

  async messages(sessionId: unknown, request: unknown) {
    const context = this.#authority.require(sessionId)
    const pagination = parsePagination(request)
    const timeline = normalizeTimeline(await this.#openCode.messages(context.sessionId))
    this.#authority.assertCurrent(context)
    const offset = pageOffset(pagination)
    if (offset > timeline.length) throw new ApiHttpError("REQUEST_INVALID")
    const page = timeline.slice(offset, offset + pagination.limit)
    const cursor = nextCursor(offset, page.length, timeline.length)
    return SessionMessagesResponseSchema.parse({
      type: "session_messages",
      version: PROTOCOL_VERSION,
      ...this.#position(context.sessionId),
      timeline: page,
      ...(cursor === undefined ? {} : { nextCursor: cursor }),
    })
  }

  async status(sessionId: unknown) {
    const context = this.#authority.require(sessionId)
    const status = normalizeStatus(await this.#openCode.status(context.sessionId))
    this.#authority.assertCurrent(context)
    return SessionStatusResponseSchema.parse({
      type: "session_status",
      version: PROTOCOL_VERSION,
      ...this.#position(context.sessionId),
      status,
    })
  }

  async todos(sessionId: unknown) {
    const context = this.#authority.require(sessionId)
    const todos = normalizeTodos(await this.#openCode.todos(context.sessionId))
    this.#authority.assertCurrent(context)
    return SessionTodosResponseSchema.parse({
      type: "session_todos",
      version: PROTOCOL_VERSION,
      ...this.#position(context.sessionId),
      todos,
    })
  }

  async pending(sessionId: unknown) {
    const context = this.#authority.require(sessionId)
    const [permissions, questions] = await Promise.all([
      this.#openCode.permissions(context.sessionId),
      this.#openCode.questions(context.sessionId),
    ])
    this.#authority.assertCurrent(context)
    return SessionPendingActionsResponseSchema.parse({
      type: "session_pending_actions",
      version: PROTOCOL_VERSION,
      ...this.#position(context.sessionId),
      pendingPermissions: normalizePermissions(permissions, context.sessionId),
      pendingQuestions: normalizeQuestions(questions, context.sessionId),
    })
  }

  async #summary(exposure: ProcessExposure): Promise<SessionSummary> {
    const context = this.#authority.require(exposure.sessionId)
    const [session, status, permissions, questions] = await Promise.all([
      this.#openCode.get(context.sessionId),
      this.#openCode.status(context.sessionId),
      this.#openCode.permissions(context.sessionId),
      this.#openCode.questions(context.sessionId),
    ])
    this.#authority.assertCurrent(context)
    const normalizedSession = normalizeSession(session)
    return {
      id: context.sessionId,
      title: normalizedSession.title,
      status: normalizeStatus(status),
      enabledAt: exposure.enabledAt,
      updatedAt: normalizedSession.updatedAt,
      pendingPermissionCount: normalizePermissions(permissions, context.sessionId).length,
      pendingQuestionCount: normalizeQuestions(questions, context.sessionId).length,
    }
  }

  #position(sessionId: SessionId) {
    return { brokerEpoch: this.#cluster.snapshot().brokerEpoch, sequence: 0, sessionId }
  }
}
