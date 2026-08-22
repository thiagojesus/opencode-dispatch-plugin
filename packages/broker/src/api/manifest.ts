export const API_ROUTE_MANIFEST = [
  { method: "GET", path: "/api/v1/health" },
  { method: "GET", path: "/api/v1/capabilities" },
  { method: "GET", path: "/api/v1/sessions" },
  { method: "GET", path: "/api/v1/sessions/:sessionId" },
  { method: "GET", path: "/api/v1/sessions/:sessionId/messages" },
  { method: "GET", path: "/api/v1/sessions/:sessionId/status" },
  { method: "GET", path: "/api/v1/sessions/:sessionId/todos" },
  { method: "GET", path: "/api/v1/sessions/:sessionId/pending" },
  { method: "POST", path: "/api/v1/actions" },
] as const

export const TUI_ROUTE_MANIFEST = [
  { method: "GET", path: "/.well-known/opencode-dispatch/tui/challenge" },
  { method: "POST", path: "/.well-known/opencode-dispatch/tui/control" },
] as const
