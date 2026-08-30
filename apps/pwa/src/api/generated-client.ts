import {
  type CapabilitiesResponse,
  CapabilitiesResponseSchema,
  type ErrorCategory,
  type ErrorCode,
  type PaginationRequest,
  type PublicErrorEnvelope,
  PublicErrorEnvelopeSchema,
  type RemoteActionRequest,
  type RemoteActionResponse,
  RemoteActionResponseSchema,
  type SessionId,
  type SessionListResponse,
  SessionListResponseSchema,
  type SessionSnapshot,
  SessionSnapshotSchema,
} from "@opencode-dispatch/contracts"

type GeneratedApiGetRequest = {
  readonly method: "GET"
  readonly path: string
  readonly signal: AbortSignal
}

type GeneratedApiPostRequest = {
  readonly body: RemoteActionRequest
  readonly method: "POST"
  readonly path: string
  readonly signal: AbortSignal
}

export type GeneratedApiRequest = GeneratedApiGetRequest | GeneratedApiPostRequest

export interface ApiTransport {
  request(input: GeneratedApiRequest): Promise<unknown>
}

export interface GeneratedApiClient {
  capabilities(signal: AbortSignal): Promise<CapabilitiesResponse>
  executeAction(request: RemoteActionRequest, signal: AbortSignal): Promise<RemoteActionResponse>
  listSessions(request: PaginationRequest, signal: AbortSignal): Promise<SessionListResponse>
  sessionSnapshot(sessionId: SessionId, signal: AbortSignal): Promise<SessionSnapshot>
}

export class RemoteApiError extends Error {
  override readonly name = "RemoteApiError"
  readonly category: ErrorCategory
  readonly code: ErrorCode
  readonly publicMessage: string
  readonly retryable: boolean

  constructor(envelope: PublicErrorEnvelope) {
    super(envelope.error.message)
    this.category = envelope.error.category
    this.code = envelope.error.code
    this.publicMessage = envelope.error.message
    this.retryable = envelope.error.retryable
  }
}

function sessionListPath(request: PaginationRequest): string {
  const query = new URLSearchParams({ limit: String(request.limit) })
  if (request.cursor !== undefined) {
    query.set("cursor", request.cursor)
  }
  return `/api/v1/sessions?${query.toString()}`
}

function parseActionResponse(value: unknown): RemoteActionResponse {
  const error = PublicErrorEnvelopeSchema.safeParse(value)
  if (error.success) {
    throw new RemoteApiError(error.data)
  }
  return RemoteActionResponseSchema.parse(value)
}

export function createGeneratedApiClient(transport: ApiTransport): GeneratedApiClient {
  return {
    async capabilities(signal) {
      const response = await transport.request({
        method: "GET",
        path: "/api/v1/capabilities",
        signal,
      })
      return CapabilitiesResponseSchema.parse(response)
    },
    async executeAction(request, signal) {
      const response = await transport.request({
        body: request,
        method: "POST",
        path: "/api/v1/actions",
        signal,
      })
      return parseActionResponse(response)
    },
    async listSessions(request, signal) {
      const response = await transport.request({
        method: "GET",
        path: sessionListPath(request),
        signal,
      })
      return SessionListResponseSchema.parse(response)
    },
    async sessionSnapshot(sessionId, signal) {
      const path = `/api/v1/sessions/${encodeURIComponent(sessionId)}`
      const response = await transport.request({ method: "GET", path, signal })
      return SessionSnapshotSchema.parse(response)
    },
  }
}
