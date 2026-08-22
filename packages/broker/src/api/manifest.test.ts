import { expect, test } from "bun:test"

import { API_ROUTE_MANIFEST, TUI_ROUTE_MANIFEST } from "./index.ts"

test("publishes only the versioned least-privilege API and authenticated loopback routes", () => {
  const expectedApiRoutes = [
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
  const expectedTuiRoutes = [
    { method: "GET", path: "/.well-known/opencode-dispatch/tui/challenge" },
    { method: "POST", path: "/.well-known/opencode-dispatch/tui/control" },
  ] as const

  expect(API_ROUTE_MANIFEST).toEqual(expectedApiRoutes)
  expect(TUI_ROUTE_MANIFEST).toEqual(expectedTuiRoutes)
  expect(JSON.stringify([...API_ROUTE_MANIFEST, ...TUI_ROUTE_MANIFEST])).not.toMatch(
    /config|provider|file|pty|shell|share|delete|create|update/u,
  )
})
