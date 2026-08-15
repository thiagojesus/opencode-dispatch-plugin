import { expect, test } from "bun:test"

const implementation = Bun.file(new URL("./index.ts", import.meta.url))

test("extracts ownership signals from documented legacy and v2 events", async () => {
  expect(await implementation.exists()).toBe(true)
  const { parseOpenCodeSessionSignal } = await import("./index.ts")

  const message = parseOpenCodeSessionSignal(
    { type: "message.updated", properties: { info: { sessionID: "ses-event" } } },
    101,
  )
  const permission = parseOpenCodeSessionSignal(
    { type: "permission.v2.asked", properties: { sessionID: "ses-event" } },
    102,
  )
  const question = parseOpenCodeSessionSignal(
    { type: "question.asked", properties: { sessionID: "ses-event" } },
    103,
  )

  expect(message?.eventType).toBe("message.updated")
  expect(Number(message?.observedAt)).toBe(101)
  expect(String(message?.sessionId)).toBe("ses-event")
  expect(message?.source).toBe("live")
  expect(permission?.eventType).toBe("permission.v2.asked")
  expect(Number(permission?.observedAt)).toBe(102)
  expect(String(permission?.sessionId)).toBe("ses-event")
  expect(question?.eventType).toBe("question.asked")
  expect(Number(question?.observedAt)).toBe(103)
  expect(String(question?.sessionId)).toBe("ses-event")
})

test("ignores unrelated events and errors without a session identity", async () => {
  expect(await implementation.exists()).toBe(true)
  const { parseOpenCodeSessionSignal } = await import("./index.ts")

  expect(parseOpenCodeSessionSignal({ type: "file.edited", properties: {} }, 201)).toBeUndefined()
  expect(parseOpenCodeSessionSignal({ type: "session.error", properties: {} }, 202)).toBeUndefined()
})

test("creates a status seed without treating it as a live event", async () => {
  expect(await implementation.exists()).toBe(true)
  const { createOpenCodeStatusSeed } = await import("./index.ts")

  const seed = createOpenCodeStatusSeed("ses-seed", 301)

  expect(seed.eventType).toBe("session.status")
  expect(Number(seed.observedAt)).toBe(301)
  expect(String(seed.sessionId)).toBe("ses-seed")
  expect(seed.source).toBe("seed")
})

test("extracts ownership signals from documented compacted and diff events", async () => {
  expect(await implementation.exists()).toBe(true)
  const { parseOpenCodeSessionSignal } = await import("./index.ts")

  const compacted = parseOpenCodeSessionSignal(
    { type: "session.compacted", properties: { sessionID: "ses-document-events" } },
    401,
  )
  const diff = parseOpenCodeSessionSignal(
    { type: "session.diff", properties: { sessionID: "ses-document-events", diff: [] } },
    402,
  )

  expect(compacted?.eventType).toBe("session.compacted")
  expect(Number(compacted?.observedAt)).toBe(401)
  expect(String(compacted?.sessionId)).toBe("ses-document-events")
  expect(compacted?.source).toBe("live")
  expect(diff?.eventType).toBe("session.diff")
  expect(Number(diff?.observedAt)).toBe(402)
  expect(String(diff?.sessionId)).toBe("ses-document-events")
  expect(diff?.source).toBe("live")
})
