import { expect, test } from "bun:test"

const implementation = Bun.file(new URL("./open-code.ts", import.meta.url))

test("starts isolated minimum and latest-compatible OpenCode servers on loopback", async () => {
  expect(await implementation.exists()).toBe(true)
  const { startOpenCodeFixture } = await import("./open-code.ts")
  const minimum = await startOpenCodeFixture({ compatibility: "1.18.3" })
  const latest = await startOpenCodeFixture({ compatibility: "latest-compatible" })

  try {
    const responses = await Promise.all([
      fetch(new URL(minimum.routes.health, minimum.origin)),
      fetch(new URL(latest.routes.health, latest.origin)),
    ])

    expect(new URL(minimum.origin).hostname).toBe("127.0.0.1")
    expect(new URL(latest.origin).hostname).toBe("127.0.0.1")
    expect(new URL(minimum.origin).port).not.toBe(new URL(latest.origin).port)
    expect(await responses[0]?.json()).toEqual({ healthy: true, version: "1.18.3" })
    expect(await responses[1]?.json()).toEqual({ healthy: true, version: "latest-compatible" })
  } finally {
    await Promise.all([minimum.stop(), latest.stop()])
  }
})

test("serves only the documented read route inventory", async () => {
  expect(await implementation.exists()).toBe(true)
  const { startOpenCodeFixture } = await import("./open-code.ts")
  const fixture = await startOpenCodeFixture({ compatibility: "1.18.3" })

  try {
    const responses = await Promise.all([
      fetch(new URL(fixture.routes.status, fixture.origin)),
      fetch(new URL(fixture.routes.session, fixture.origin)),
      fetch(new URL(fixture.routes.messages, fixture.origin)),
      fetch(new URL(fixture.routes.todo, fixture.origin)),
      fetch(new URL(fixture.routes.permissions, fixture.origin)),
      fetch(new URL(fixture.routes.questions, fixture.origin)),
    ])

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200, 200])
  } finally {
    await fixture.stop()
  }
})

test("records documented prompt, abort, permission, and question actions", async () => {
  expect(await implementation.exists()).toBe(true)
  const { startOpenCodeFixture } = await import("./open-code.ts")
  const fixture = await startOpenCodeFixture({ compatibility: "latest-compatible" })

  try {
    const responses = await Promise.all([
      fetch(new URL(fixture.routes.promptAsync, fixture.origin), {
        body: JSON.stringify({ parts: [{ type: "text", text: "fixture prompt" }] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      fetch(new URL(fixture.routes.abort, fixture.origin), { method: "POST" }),
      fetch(new URL(fixture.routes.permissionReply, fixture.origin), {
        body: JSON.stringify({ reply: "once" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      fetch(new URL(fixture.routes.questionReply, fixture.origin), {
        body: JSON.stringify({ answers: [["Continue"]] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    ])

    expect(responses.map(({ status }) => status)).toEqual([204, 200, 204, 204])
    expect(
      fixture
        .requests()
        .map(({ operation }) => operation)
        .sort(),
    ).toEqual(["abort", "permission_reply", "prompt_async", "question_reply"])
  } finally {
    await fixture.stop()
  }
})

test("fails an undocumented route instead of returning permissive success", async () => {
  expect(await implementation.exists()).toBe(true)
  const { startOpenCodeFixture } = await import("./open-code.ts")
  const fixture = await startOpenCodeFixture({ compatibility: "1.18.3" })

  try {
    const response = await fetch(new URL("/undocumented", fixture.origin))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "fixture_route_not_found" })
  } finally {
    await fixture.stop()
  }
})

test("rejects a malformed OpenCode event frame", async () => {
  expect(await implementation.exists()).toBe(true)
  const { OpenCodeFixtureProtocolError, readOpenCodeEvents, startOpenCodeFixture } = await import(
    "./open-code.ts"
  )
  const fixture = await startOpenCodeFixture({
    compatibility: "1.18.3",
    eventFault: "malformed",
  })

  try {
    await expect(
      readOpenCodeEvents(new URL(fixture.routes.events, fixture.origin)),
    ).rejects.toBeInstanceOf(OpenCodeFixtureProtocolError)
  } finally {
    await fixture.stop()
  }
})

test("rejects reordered OpenCode event frames", async () => {
  expect(await implementation.exists()).toBe(true)
  const { OpenCodeFixtureProtocolError, readOpenCodeEvents, startOpenCodeFixture } = await import(
    "./open-code.ts"
  )
  const fixture = await startOpenCodeFixture({
    compatibility: "latest-compatible",
    eventFault: "reordered",
  })

  try {
    await expect(
      readOpenCodeEvents(new URL(fixture.routes.events, fixture.origin)),
    ).rejects.toBeInstanceOf(OpenCodeFixtureProtocolError)
  } finally {
    await fixture.stop()
  }
})

test("rejects a dropped OpenCode event frame as a sequence gap", async () => {
  expect(await implementation.exists()).toBe(true)
  const { readOpenCodeEvents, startOpenCodeFixture } = await import("./open-code.ts")
  const fixture = await startOpenCodeFixture({
    compatibility: "latest-compatible",
    eventFault: "dropped",
  })

  try {
    await expect(
      readOpenCodeEvents(new URL(fixture.routes.events, fixture.origin)),
    ).rejects.toMatchObject({
      name: "OpenCodeFixtureProtocolError",
      code: "sequence_gap",
    })
  } finally {
    await fixture.stop()
  }
})
