import { expect, test } from "bun:test"
import {
  BrokerEpochSchema,
  EventStreamServerFrameSchema,
  MonotonicSequenceSchema,
  PROTOCOL_VERSION,
} from "@opencode-dispatch/contracts"

import type { BrokerHttpRouter } from "../api/index.ts"
import { startTailscaleServeTarget } from "./leader-http.ts"

test("upgrades only the event route and carries parsed stream frames", async () => {
  const brokerEpoch = BrokerEpochSchema.parse("550e8400-e29b-41d4-a716-446655440124")
  let subscribed = false
  const router: BrokerHttpRouter = {
    handle: async () => new Response(null, { status: 204 }),
    prepareEventStream: async () => undefined,
    publishSignal: async () => undefined,
    revokeSession: () => undefined,
    subscribeEvents(_input, sink) {
      subscribed = true
      sink.send({
        type: "ready",
        version: PROTOCOL_VERSION,
        brokerEpoch,
        sequence: MonotonicSequenceSchema.parse(0),
      })
      return () => undefined
    },
  }
  const server = startTailscaleServeTarget("127.0.0.1", router)
  const socket = new WebSocket("ws://127.0.0.1:43111/api/v1/events")
  try {
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true })
      socket.addEventListener("error", () => reject(new Error("event websocket failed")), {
        once: true,
      })
    })
    socket.send(JSON.stringify({ type: "subscribe" }))
    const frame = await new Promise<unknown>((resolve) => {
      socket.addEventListener("message", (message) => resolve(JSON.parse(String(message.data))), {
        once: true,
      })
    })

    expect(subscribed).toBe(true)
    expect(EventStreamServerFrameSchema.parse(frame)).toMatchObject({
      type: "ready",
      brokerEpoch,
      sequence: 0,
    })
  } finally {
    socket.close()
    await server.stop(true)
  }
})
