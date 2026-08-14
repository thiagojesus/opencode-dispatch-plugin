import {
  type CapabilitiesResponse,
  CapabilitiesResponseSchema,
  type PaginationRequest,
  type SessionId,
  type SessionListResponse,
  SessionListResponseSchema,
  type SessionSnapshot,
  SessionSnapshotSchema,
} from "@opencode-dispatch/contracts"

export type GeneratedApiRequest = {
  readonly method: "GET"
  readonly path: string
  readonly signal: AbortSignal
}

export interface ApiTransport {
  request(input: GeneratedApiRequest): Promise<unknown>
}

export interface GeneratedApiClient {
  capabilities(signal: AbortSignal): Promise<CapabilitiesResponse>
  listSessions(request: PaginationRequest, signal: AbortSignal): Promise<SessionListResponse>
  sessionSnapshot(sessionId: SessionId, signal: AbortSignal): Promise<SessionSnapshot>
}

function sessionListPath(request: PaginationRequest): string {
  const query = new URLSearchParams({ limit: String(request.limit) })
  if (request.cursor !== undefined) {
    query.set("cursor", request.cursor)
  }
  return `/api/v1/sessions?${query.toString()}`
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
