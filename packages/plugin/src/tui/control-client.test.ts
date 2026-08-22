import { expect, test } from "bun:test"

import {
  createInternalAuthResponse,
  HostSecret,
  InternalAuthVerifier,
} from "@opencode-dispatch/broker/security"

import { READY_SNAPSHOT } from "./test-support.ts"

const clientImplementation = Bun.file(new URL("./control-client.ts", import.meta.url))

test("authenticates every loopback control operation without sending the host secret", async () => {
  expect(await clientImplementation.exists()).toBe(true)
  const { createLocalDispatchControlClient } = await import("./control-client.ts")
  const secret = HostSecret.generate()
  const verifier = new InternalAuthVerifier(secret, {
    challengeTtlMs: 5_000,
    maxChallenges: 16,
    now: Date.now,
  })
  const operations: unknown[] = []
  const observedHeaders: Headers[] = []
  let exposed = false
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      observedHeaders.push(request.headers)
      const url = new URL(request.url)
      if (url.pathname === "/sessions/ses-current") {
        return new Response(exposed ? "available" : "gone", { status: exposed ? 200 : 410 })
      }
      if (url.pathname.endsWith("/challenge")) {
        return Response.json({
          type: "dispatch_tui_challenge",
          version: 1,
          challenge: verifier.issueChallenge(),
        })
      }
      const body: unknown = await request.json()
      if (
        typeof body !== "object" ||
        body === null ||
        !("auth" in body) ||
        !("operation" in body)
      ) {
        return Response.json({ code: "malformed_response" }, { status: 400 })
      }
      const decision = verifier.verify(body.auth, "dispatch.tui.control:v1")
      if (!decision.ok) return Response.json({ code: decision.error.code }, { status: 401 })
      operations.push(body.operation)
      if (
        typeof body.operation === "object" &&
        body.operation !== null &&
        "type" in body.operation
      ) {
        if (body.operation.type === "enable") exposed = true
        if (body.operation.type === "disable") exposed = false
      }
      return Response.json({
        type: "dispatch_tui_snapshot",
        version: 1,
        snapshot: {
          ...READY_SNAPSHOT,
          sessions: READY_SNAPSHOT.sessions.map((session) =>
            session.id === "ses-current" ? { ...session, enabled: exposed } : session,
          ),
        },
      })
    },
  })

  const client = createLocalDispatchControlClient({
    origin: server.url.origin,
    loadSecret: async () => secret,
    pollIntervalMs: 60_000,
  })
  try {
    await client.snapshot()
    await client.enable({ sessionId: "ses-current", title: "Current session" })
    expect(
      await fetch(`${server.url.origin}/sessions/ses-current`).then((response) => response.status),
    ).toBe(200)
    await client.disable("ses-current")
    expect(
      await fetch(`${server.url.origin}/sessions/ses-current`).then((response) => response.status),
    ).toBe(410)
  } finally {
    await client.dispose()
    await server.stop(true)
  }

  expect(operations).toEqual([
    { type: "status" },
    { type: "enable", sessionId: "ses-current", title: "Current session" },
    { type: "disable", sessionId: "ses-current" },
  ])
  const serializedHeaders = JSON.stringify(observedHeaders.map((headers) => [...headers]))
  expect(serializedHeaders).not.toContain(secret.serialize())
  expect(serializedHeaders).not.toContain("Authorization")
})

test("fails closed on a foreign listener and malformed diagnostics", async () => {
  expect(await clientImplementation.exists()).toBe(true)
  const { createLocalDispatchControlClient } = await import("./control-client.ts")
  const secret = HostSecret.generate()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("foreign", { status: 200 }),
  })
  const client = createLocalDispatchControlClient({
    origin: server.url.origin,
    loadSecret: async () => secret,
    pollIntervalMs: 60_000,
  })

  try {
    await expect(client.snapshot()).rejects.toMatchObject({ code: "foreign_listener" })
  } finally {
    await client.dispose()
    await server.stop(true)
  }
})

test("rejects diagnostics, URLs, and fields outside the privacy-safe response schema", async () => {
  expect(await clientImplementation.exists()).toBe(true)
  const { createLocalDispatchControlClient } = await import("./control-client.ts")
  const secret = HostSecret.generate()
  const verifier = new InternalAuthVerifier(secret, {
    challengeTtlMs: 5_000,
    maxChallenges: 4,
    now: Date.now,
  })
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      if (new URL(request.url).pathname.endsWith("/challenge")) {
        return Response.json({
          type: "dispatch_tui_challenge",
          version: 1,
          challenge: verifier.issueChallenge(),
        })
      }
      const body: unknown = await request.json()
      if (typeof body !== "object" || body === null || !("auth" in body)) {
        return Response.json({ code: "control_rejected" }, { status: 400 })
      }
      const decision = verifier.verify(body.auth, "dispatch.tui.control:v1")
      if (!decision.ok) return Response.json({ code: "control_rejected" }, { status: 401 })
      return Response.json({
        type: "dispatch_tui_snapshot",
        version: 1,
        snapshot: {
          ...READY_SNAPSHOT,
          tailscale: {
            kind: "ready",
            stableUrl: "https://workstation.example.ts.net/?token=HOST_SECRET_SENTINEL",
          },
          diagnostics: {
            broker: "/Users/private/project",
            registration: "TRANSCRIPT_SENTINEL",
          },
          headers: { Authorization: "Bearer HOST_SECRET_SENTINEL" },
        },
      })
    },
  })
  const client = createLocalDispatchControlClient({
    origin: server.url.origin,
    loadSecret: async () => secret,
    pollIntervalMs: 60_000,
  })

  try {
    await expect(client.snapshot()).rejects.toMatchObject({ code: "malformed_response" })
  } finally {
    await client.dispose()
    await server.stop(true)
  }
})

test("uses the existing internal authentication primitive for fixture parity", () => {
  const secret = HostSecret.generate()
  const challenge = { issuedAtMs: 1_000, nonce: "abcdefghijklmnopqrstuv" }

  expect(createInternalAuthResponse(secret, challenge, "dispatch.tui.control:v1")).toEqual({
    ...challenge,
    signature: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
  })
})

test("aborts an in-flight control request during disposal", async () => {
  expect(await clientImplementation.exists()).toBe(true)
  const { createLocalDispatchControlClient } = await import("./control-client.ts")
  const secret = HostSecret.generate()
  let aborted = false
  const client = createLocalDispatchControlClient({
    loadSecret: async () => secret,
    fetchRequest: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            aborted = true
            reject(init.signal?.reason)
          },
          { once: true },
        )
      }),
    pollIntervalMs: 60_000,
  })

  const pending = client.snapshot()
  await client.dispose()

  await expect(pending).rejects.toMatchObject({ code: "broker_unavailable" })
  expect(aborted).toBe(true)
})
