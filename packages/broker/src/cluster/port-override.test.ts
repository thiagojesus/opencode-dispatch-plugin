import { expect, test } from "bun:test"

import { clusterWebSocketUrl } from "./protocol.ts"

test("derives the member WebSocket endpoint from the configured loopback broker origin", () => {
  expect(clusterWebSocketUrl("http://127.0.0.1:45123")).toBe(
    "ws://127.0.0.1:45123/.well-known/opencode-dispatch/cluster/member",
  )
})
