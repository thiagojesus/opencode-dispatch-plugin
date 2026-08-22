import { expect, test } from "bun:test"

import {
  BrokerEpochSchema,
  LoopbackServerUrlSchema,
  ProcessExposureSchema,
  ProcessIdSchema,
  ProcessInstanceNonceSchema,
  TailscaleLoginSchema,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"

import { createOpenCodeStatusSeed, OpenCodeAdapter } from "../opencode/index.ts"
import { HostSecret } from "../security/index.ts"
import { type ApiClusterPort, createBrokerHttpRouter } from "./index.ts"
import { IDEMPOTENCY_KEY, NOW, STABLE_ORIGIN, trustedHeaders } from "./test-support.ts"

test("drives the real OpenCode adapter through snapshot and text-only prompt routes", async () => {
  const { startOpenCodeFixture } = await import("../../../../tests/fixtures/open-code.ts")
  const fixture = await startOpenCodeFixture({ compatibility: "1.18.3" })
  const processNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000290")
  const brokerEpoch = BrokerEpochSchema.parse("00000000-0000-4000-8000-000000000291")
  const exposure = ProcessExposureSchema.parse({
    version: 1,
    processNonce,
    sessionId: fixture.scenario.sessionId,
    title: fixture.scenario.session.title,
    enabledAt: NOW,
  })
  const cluster: ApiClusterPort = {
    snapshot: () => ({
      brokerEpoch,
      members: [
        {
          processNonce,
          serverUrl: LoopbackServerUrlSchema.parse(fixture.origin),
          pid: ProcessIdSchema.parse(2290),
          startedAt: UnixEpochMsSchema.parse(NOW),
          lastSeenAt: NOW,
          expiresAt: NOW + 15_000,
        },
      ],
      exposures: [exposure],
    }),
    enable: async () => undefined,
    disable: async () => undefined,
  }
  const openCode = new OpenCodeAdapter()
  openCode.registerProcess({ processNonce, serverUrl: fixture.origin })
  openCode.observe(processNonce, {
    ...createOpenCodeStatusSeed(fixture.scenario.sessionId, NOW),
    source: "live",
  })
  const router = createBrokerHttpRouter({
    backendOrigin: "http://127.0.0.1:43110",
    cluster,
    hostSecret: HostSecret.generate(),
    inspectTailscale: async () => ({
      kind: "ready",
      allowedLogin: TailscaleLoginSchema.parse("fixture-user@example.test"),
      grantVerification: "per_request",
      machineName: "workstation",
      stableUrl: STABLE_ORIGIN,
    }),
    now: () => NOW,
    openCode,
  })
  try {
    const snapshot = await router.handle(
      new Request(`${STABLE_ORIGIN}/api/v1/sessions/${fixture.scenario.sessionId}`, {
        headers: trustedHeaders(),
      }),
      "trusted_proxy",
    )
    const actionHeaders = trustedHeaders()
    actionHeaders.set("content-type", "application/json")
    const prompt = await router.handle(
      new Request(`${STABLE_ORIGIN}/api/v1/actions`, {
        method: "POST",
        headers: actionHeaders,
        body: JSON.stringify({
          type: "prompt",
          version: 1,
          sessionId: fixture.scenario.sessionId,
          idempotencyKey: IDEMPOTENCY_KEY,
          text: "Fixture API prompt",
        }),
      }),
      "trusted_proxy",
    )

    expect(snapshot.status).toBe(200)
    expect(await snapshot.json()).toMatchObject({
      type: "session_snapshot",
      session: { id: fixture.scenario.sessionId, title: "Fixture session" },
      timeline: [{ type: "user_message", text: "Fixture transcript" }],
    })
    expect(prompt.status).toBe(202)
    expect(fixture.requests()).toEqual([{ operation: "prompt_async", text: "Fixture API prompt" }])
  } finally {
    openCode.dispose()
    await fixture.stop()
  }
})
