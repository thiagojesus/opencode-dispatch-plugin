import { expect, test } from "bun:test"

import { browserApi } from "../src/features/sessions/browser-api"

test("marks session API reads as network-only and no-store", async () => {
  const originalFetch = globalThis.fetch
  let capturedInit: RequestInit | undefined
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init
      return new Response(
        JSON.stringify({
          type: "session_list",
          version: 1,
          brokerEpoch: "550e8400-e29b-41d4-a716-446655440122",
          sequence: 0,
          sessions: [],
        }),
        { headers: { "content-type": "application/json" } },
      )
    },
    writable: true,
  })

  try {
    await browserApi.listSessions({ limit: 1 }, new AbortController().signal)
  } finally {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
      writable: true,
    })
  }

  expect(capturedInit?.cache).toBe("no-store")
  expect(new Headers(capturedInit?.headers).get("cache-control")).toBe("no-store")
})
