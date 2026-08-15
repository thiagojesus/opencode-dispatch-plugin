import { expect, test } from "bun:test"

import { ProcessInstanceNonceSchema } from "@opencode-dispatch/contracts"

import type { OpenCodeCompatibility } from "../../../../tests/fixtures/open-code.ts"

const implementation = Bun.file(new URL("./index.ts", import.meta.url))
const COMPATIBILITY_TARGETS = [
  "1.18.3",
  "latest-compatible",
] as const satisfies readonly OpenCodeCompatibility[]

for (const compatibility of COMPATIBILITY_TARGETS) {
  test(`uses only documented SDK operations against ${compatibility}`, async () => {
    expect(await implementation.exists()).toBe(true)
    const { deriveOpenCodeAuthorization, OpenCodeAdapter } = await import("./index.ts")
    const { startOpenCodeFixture } = await import("../../../../tests/fixtures/open-code.ts")
    const authorization = deriveOpenCodeAuthorization({
      OPENCODE_SERVER_USERNAME: "fixture-user",
      OPENCODE_SERVER_PASSWORD: "fixture-password",
    })
    if (authorization === undefined) throw new TypeError("Expected fixture authorization.")
    const fixture = await startOpenCodeFixture({ compatibility, authorization })
    const processNonce = ProcessInstanceNonceSchema.parse("00000000-0000-4000-8000-000000000071")
    const adapter = new OpenCodeAdapter()

    try {
      adapter.registerProcess({ processNonce, serverUrl: fixture.origin, authorization })
      await adapter.seedStatuses(processNonce, 1_000)

      expect(adapter.resolveOwner(fixture.scenario.sessionId)).toBe(processNonce)
      expect((await adapter.get(fixture.scenario.sessionId)).id).toBe(fixture.scenario.sessionId)
      expect((await adapter.messages(fixture.scenario.sessionId))[0]?.info.id).toBe(
        fixture.scenario.messageId,
      )
      expect(await adapter.status(fixture.scenario.sessionId)).toEqual(fixture.scenario.status)
      expect((await adapter.todos(fixture.scenario.sessionId))[0]?.content).toBe("Exercise fixture")
      expect((await adapter.permissions(fixture.scenario.sessionId))[0]?.id).toBe(
        fixture.scenario.permissionRequestId,
      )
      expect((await adapter.questions(fixture.scenario.sessionId))[0]?.id).toBe(
        fixture.scenario.questionRequestId,
      )
      await adapter.promptAsync(fixture.scenario.sessionId, "Adapter fixture prompt")
      expect(await adapter.abort(fixture.scenario.sessionId)).toBe(true)
      await adapter.replyPermission(
        fixture.scenario.sessionId,
        fixture.scenario.permissionRequestId,
        "once",
      )
      await adapter.replyQuestion(fixture.scenario.sessionId, fixture.scenario.questionRequestId, [
        ["Continue"],
      ])

      expect(fixture.requests()).toEqual([
        { operation: "prompt_async", text: "Adapter fixture prompt" },
        { operation: "abort" },
        { operation: "permission_reply", reply: "once" },
        { operation: "question_reply", answers: [["Continue"]] },
      ])
    } finally {
      adapter.dispose()
      await fixture.stop()
    }
  })
}
