import { expect, test } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"

import type { OpenCodeCompatibility } from "./open-code.ts"

const COMPATIBILITY_TARGETS = [
  "1.18.3",
  "latest-compatible",
] as const satisfies readonly OpenCodeCompatibility[]

for (const compatibility of COMPATIBILITY_TARGETS) {
  test(`matches documented SDK request and response shapes for ${compatibility}`, async () => {
    const { startOpenCodeFixture } = await import("./open-code.ts")
    const fixture = await startOpenCodeFixture({ compatibility })
    const client = createOpencodeClient({ baseUrl: fixture.origin })
    const sessionID = fixture.scenario.sessionId

    try {
      const health = await client.global.health()
      const status = await client.session.status()
      const session = await client.session.get({ sessionID })
      const messages = await client.session.messages({ sessionID })
      const todos = await client.session.todo({ sessionID })
      const permissions = await client.v2.session.permission.list({ sessionID })
      const questions = await client.v2.session.question.list({ sessionID })
      const prompt = await client.session.promptAsync({
        sessionID,
        parts: [{ type: "text", text: "SDK fixture prompt" }],
      })
      const abort = await client.session.abort({ sessionID })
      const permissionReply = await client.v2.session.permission.reply({
        sessionID,
        requestID: fixture.scenario.permissionRequestId,
        reply: "once",
      })
      const questionReply = await client.v2.session.question.reply({
        sessionID,
        requestID: fixture.scenario.questionRequestId,
        questionV2Reply: { answers: [["Continue"]] },
      })

      expect(health.data).toEqual({ healthy: true, version: compatibility })
      expect(status.data).toEqual({ [sessionID]: fixture.scenario.status })
      expect(session.data?.id).toBe(sessionID)
      expect(messages.data?.[0]?.info.id).toBe(fixture.scenario.messageId)
      expect(todos.data?.[0]?.content).toBe("Exercise fixture")
      expect(permissions.data?.data[0]?.id).toBe(fixture.scenario.permissionRequestId)
      expect(questions.data?.data[0]?.id).toBe(fixture.scenario.questionRequestId)
      expect(prompt.response.status).toBe(204)
      expect(abort.data).toBe(true)
      expect(permissionReply.response.status).toBe(204)
      expect(questionReply.response.status).toBe(204)
    } finally {
      await fixture.stop()
    }
  })
}
