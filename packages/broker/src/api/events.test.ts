import { describe, expect, test } from "bun:test"

import {
  BrokerEpochSchema,
  EventStreamServerFrameSchema,
  MonotonicSequenceSchema,
  PROTOCOL_VERSION,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"

import { SessionEventHub } from "../events/hub.ts"
import { createBrokerHttpRouter } from "./index.ts"
import {
  FakeCluster,
  FakeOpenCode,
  NOW,
  PROCESS_NONCE,
  routerOptions,
  SESSION_ID,
  STABLE_ORIGIN,
  trustedHeaders,
} from "./test-support.ts"

describe("authenticated session event facade", () => {
  test("authenticates trusted upgrades and rejects direct ingress", async () => {
    const cluster = new FakeCluster()
    const events = new SessionEventHub({
      brokerEpoch: cluster.brokerEpoch,
      now: () => NOW,
      replayLimit: 8,
    })
    const router = createBrokerHttpRouter({
      ...routerOptions(cluster, new FakeOpenCode()),
      events,
    })
    const request = new Request(`${STABLE_ORIGIN}/api/v1/events`, {
      headers: trustedHeaders(),
    })

    expect(await router.prepareEventStream(request, "trusted_proxy")).toBeUndefined()
    expect((await router.prepareEventStream(request, "direct"))?.status).toBe(401)
  })

  test("publishes only authoritative enabled-session invalidations with matching positions", async () => {
    const cluster = new FakeCluster()
    const openCode = new FakeOpenCode()
    const events = new SessionEventHub({
      brokerEpoch: cluster.brokerEpoch,
      now: () => NOW,
      replayLimit: 8,
    })
    const router = createBrokerHttpRouter({ ...routerOptions(cluster, openCode), events })
    const frames: unknown[] = []
    router.subscribeEvents(
      {
        type: "subscribe",
        version: PROTOCOL_VERSION,
        brokerEpoch: BrokerEpochSchema.parse(cluster.brokerEpoch),
        sequence: MonotonicSequenceSchema.parse(0),
        scope: { type: "session", sessionId: SESSION_ID },
      },
      { send: (frame) => frames.push(frame), close: () => undefined },
    )

    await router.publishSignal(PROCESS_NONCE, {
      eventType: "message.part.updated",
      observedAt: UnixEpochMsSchema.parse(NOW),
      sessionId: SESSION_ID,
      source: "live",
    })
    const snapshot = await router.handle(
      new Request(`${STABLE_ORIGIN}/api/v1/sessions/${SESSION_ID}`, {
        headers: trustedHeaders(),
      }),
      "trusted_proxy",
    )

    expect(EventStreamServerFrameSchema.parse(frames.at(-1))).toMatchObject({
      type: "event",
      sequence: 1,
      sessionId: SESSION_ID,
      event: { type: "session.updated" },
    })
    expect(await snapshot.json()).toMatchObject({ sequence: 1 })

    cluster.exposures = []
    await router.publishSignal(PROCESS_NONCE, {
      eventType: "message.part.updated",
      observedAt: UnixEpochMsSchema.parse(NOW + 1),
      sessionId: SESSION_ID,
      source: "live",
    })
    expect(frames).toHaveLength(2)
  })
})
