import { describe, expect, test } from "bun:test"

import { CONTROL_ACTIONS, MAX_PROMPT_BYTES } from "@opencode-dispatch/contracts"

import { createBrokerHttpRouter } from "./index.ts"
import {
  FakeCluster,
  FakeOpenCode,
  IDEMPOTENCY_KEY,
  routerOptions,
  SESSION_ID,
  STABLE_ORIGIN,
  trustedHeaders,
} from "./test-support.ts"

function remoteRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`${STABLE_ORIGIN}${path}`, {
    ...init,
    headers: init.headers ?? trustedHeaders(),
  })
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json()
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "code" in body.error &&
    typeof body.error.code === "string"
  ) {
    return body.error.code
  }
  return undefined
}

describe("remote API route contract", () => {
  test.each([
    ["/api/v1/health", "health"],
    ["/api/v1/capabilities", "capabilities"],
    ["/api/v1/sessions?limit=25", "session_list"],
    [`/api/v1/sessions/${SESSION_ID}`, "session_snapshot"],
    [`/api/v1/sessions/${SESSION_ID}/messages?limit=25`, "session_messages"],
    [`/api/v1/sessions/${SESSION_ID}/status`, "session_status"],
    [`/api/v1/sessions/${SESSION_ID}/todos`, "session_todos"],
    [`/api/v1/sessions/${SESSION_ID}/pending`, "session_pending_actions"],
  ])("serves GET %s through the strict public contract", async (path, expectedType) => {
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), new FakeOpenCode()))

    const response = await router.handle(remoteRequest(path), "trusted_proxy")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ type: expectedType, version: 1 })
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'")
    expect(JSON.stringify(body)).not.toContain("/fixture/workspace")
  })

  test("advertises exactly the Todo 2 remote action allowlist", async () => {
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), new FakeOpenCode()))

    const response = await router.handle(remoteRequest("/api/v1/capabilities"), "trusted_proxy")
    const body: unknown = await response.json()

    expect(body).toMatchObject({ actions: CONTROL_ACTIONS, maxPromptBytes: MAX_PROMPT_BYTES })
  })

  test.each([
    "/api/v1/config",
    "/api/v1/provider",
    "/api/v1/file",
    "/api/v1/pty",
    "/api/v1/shell",
    "/api/v1/sessions/create/new",
    "/api/v1/sessions/ses/share",
    "/api/v1/%2e%2e/config",
  ])("rejects forbidden route %s before any OpenCode action", async (path) => {
    const openCode = new FakeOpenCode()
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), openCode))

    const response = await router.handle(remoteRequest(path), "trusted_proxy")

    expect(response.status).toBe(404)
    expect(await errorCode(response)).toBe("ROUTE_NOT_FOUND")
    expect(openCode.promptCalls + openCode.abortCalls).toBe(0)
  })

  test.each([
    ["POST", "/api/v1/health"],
    ["PUT", "/api/v1/capabilities"],
    ["DELETE", `/api/v1/sessions/${SESSION_ID}`],
    ["GET", "/api/v1/actions"],
  ])("rejects %s on %s with a stable method error", async (method, path) => {
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), new FakeOpenCode()))

    const response = await router.handle(remoteRequest(path, { method }), "trusted_proxy")

    expect(response.status).toBe(405)
    expect(await errorCode(response)).toBe("METHOD_NOT_ALLOWED")
  })

  test.each([
    ["direct", trustedHeaders(), 401, "IDENTITY_SPOOFED", "none"],
    [
      "trusted_proxy",
      new Headers({ host: "workstation.example.ts.net", origin: STABLE_ORIGIN }),
      401,
      "IDENTITY_MISSING",
      "none",
    ],
    ["trusted_proxy", trustedHeaders(), 403, "ORIGIN_REJECTED", "origin"],
    ["trusted_proxy", trustedHeaders(), 403, "HOST_REJECTED", "host"],
    ["trusted_proxy", trustedHeaders(), 403, "CAPABILITY_MISSING", "tailscale-app-capabilities"],
  ] as const)(
    "fails closed for invalid ingress case %#",
    async (ingress, headers, status, code, removedHeader) => {
      if (removedHeader !== "none") headers.delete(removedHeader)
      const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), new FakeOpenCode()))

      const response = await router.handle(remoteRequest("/api/v1/health", { headers }), ingress)

      expect(response.status).toBe(status)
      expect(await errorCode(response)).toBe(code)
    },
  )

  test.each([
    "/api/v1/sessions?unknown=1",
    "/api/v1/sessions?limit=1&limit=2",
    "/api/v1/sessions?limit=101",
    `/api/v1/sessions/${encodeURIComponent("../config")}`,
  ])("rejects malformed path or query %s", async (path) => {
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), new FakeOpenCode()))

    const response = await router.handle(remoteRequest(path), "trusted_proxy")

    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe("REQUEST_INVALID")
  })

  test.each([
    [undefined, "{}", 415, "CONTENT_TYPE_REQUIRED"],
    ["text/plain", "{}", 415, "CONTENT_TYPE_REQUIRED"],
    ["application/json", "{", 400, "REQUEST_INVALID"],
    ["application/json", JSON.stringify({ type: "shell" }), 400, "REQUEST_INVALID"],
  ] as const)("rejects invalid JSON request case %#", async (contentType, body, status, code) => {
    const headers = trustedHeaders()
    if (contentType !== undefined) headers.set("content-type", contentType)
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), new FakeOpenCode()))

    const response = await router.handle(
      remoteRequest("/api/v1/actions", { method: "POST", headers, body }),
      "trusted_proxy",
    )

    expect(response.status).toBe(status)
    expect(await errorCode(response)).toBe(code)
  })

  test("rejects an oversized declared action body before parsing", async () => {
    const headers = trustedHeaders()
    headers.set("content-type", "application/json")
    headers.set("content-length", String(MAX_PROMPT_BYTES * 2))
    const router = createBrokerHttpRouter(routerOptions(new FakeCluster(), new FakeOpenCode()))

    const response = await router.handle(
      remoteRequest("/api/v1/actions", {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "prompt", idempotencyKey: IDEMPOTENCY_KEY }),
      }),
      "trusted_proxy",
    )

    expect(response.status).toBe(413)
    expect(await errorCode(response)).toBe("BODY_TOO_LARGE")
  })
})
