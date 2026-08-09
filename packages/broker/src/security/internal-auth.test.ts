import { describe, expect, test } from "bun:test"
import { Buffer } from "node:buffer"
import {
  createInternalAuthResponse,
  HostSecret,
  InternalAuthVerifier,
  SecurityError,
} from "./index.ts"

function createVerifier(now: () => number): InternalAuthVerifier {
  return new InternalAuthVerifier(HostSecret.generate(), {
    challengeTtlMs: 30_000,
    maxChallenges: 8,
    now,
  })
}

function throwUnknown(value: unknown): never {
  throw value
}

describe("security internal authentication", () => {
  test("accepts one HMAC response bound to the issued challenge context", () => {
    const secret = HostSecret.generate()
    const verifier = new InternalAuthVerifier(secret, {
      challengeTtlMs: 30_000,
      maxChallenges: 8,
      now: () => 1_000_000,
    })
    const challenge = verifier.issueChallenge()
    const response = createInternalAuthResponse(secret, challenge, "cluster.register:v1")

    const decision = verifier.verify(response, "cluster.register:v1")

    expect(decision).toEqual({ ok: true, value: { kind: "authenticated" } })
  })

  test("rejects replay of an already consumed challenge", () => {
    const secret = HostSecret.generate()
    const verifier = new InternalAuthVerifier(secret, {
      challengeTtlMs: 30_000,
      maxChallenges: 8,
      now: () => 1_000_000,
    })
    const challenge = verifier.issueChallenge()
    const response = createInternalAuthResponse(secret, challenge, "cluster.heartbeat:v1")
    verifier.verify(response, "cluster.heartbeat:v1")

    const replay = verifier.verify(response, "cluster.heartbeat:v1")

    expect(replay).toMatchObject({
      ok: false,
      error: { code: "auth_replayed", operation: "verify_internal_auth" },
    })
  })

  test("rejects an expired challenge without accepting a valid old signature", () => {
    let now = 1_000_000
    const secret = HostSecret.generate()
    const verifier = new InternalAuthVerifier(secret, {
      challengeTtlMs: 30_000,
      maxChallenges: 8,
      now: () => now,
    })
    const challenge = verifier.issueChallenge()
    const response = createInternalAuthResponse(secret, challenge, "cluster.unregister:v1")
    now += 30_001

    const decision = verifier.verify(response, "cluster.unregister:v1")

    expect(decision).toMatchObject({ ok: false, error: { code: "auth_expired" } })
  })

  test("rejects a signature replayed under another control binding", () => {
    const secret = HostSecret.generate()
    const verifier = new InternalAuthVerifier(secret, {
      challengeTtlMs: 30_000,
      maxChallenges: 8,
      now: () => 1_000_000,
    })
    const challenge = verifier.issueChallenge()
    const response = createInternalAuthResponse(secret, challenge, "cluster.register:v1")

    const decision = verifier.verify(response, "cluster.unregister:v1")

    expect(decision).toMatchObject({ ok: false, error: { code: "auth_invalid" } })
  })

  test("rejects malformed and wrong-length signatures without throwing", () => {
    const verifier = createVerifier(() => 1_000_000)
    const challenge = verifier.issueChallenge()
    const malformedResponse = {
      issuedAtMs: challenge.issuedAtMs,
      nonce: challenge.nonce,
      signature: "short",
    }

    const decision = verifier.verify(malformedResponse, "cluster.register:v1")

    expect(decision).toMatchObject({ ok: false, error: { code: "auth_malformed" } })
  })

  test.each([
    null,
    { issuedAtMs: 1_000_000, nonce: null, signature: null },
    new Proxy({}, { get: () => throwUnknown("RAW_NON_ERROR_SENTINEL") }),
  ])("rejects malformed runtime auth response %# without throwing", (response) => {
    const verifier = createVerifier(() => 1_000_000)

    const decision: unknown = Reflect.apply(verifier.verify, verifier, [
      response,
      "cluster.register:v1",
    ])

    expect(decision).toMatchObject({ ok: false, error: { code: "auth_malformed" } })
  })

  test("rejects a non-canonical Base64URL signature alias", () => {
    const secret = HostSecret.generate()
    const verifier = new InternalAuthVerifier(secret, {
      challengeTtlMs: 30_000,
      maxChallenges: 8,
      now: () => 1_000_000,
    })
    const challenge = verifier.issueChallenge()
    const response = createInternalAuthResponse(secret, challenge, "cluster.register:v1")
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    const finalIndex = alphabet.indexOf(response.signature.slice(-1))
    const signature = `${response.signature.slice(0, -1)}${alphabet.charAt(finalIndex + 1)}`
    expect(signature).not.toBe(response.signature)
    expect(Buffer.from(signature, "base64url")).toEqual(
      Buffer.from(response.signature, "base64url"),
    )

    const decision = verifier.verify({ ...response, signature }, "cluster.register:v1")

    expect(decision).toMatchObject({ ok: false, error: { code: "auth_malformed" } })
  })

  test("fails closed when the challenge clock is invalid", () => {
    const verifier = createVerifier(() => Number.NaN)

    const issueChallenge = () => verifier.issueChallenge()

    expect(issueChallenge).toThrow(SecurityError)
    expect(issueChallenge).toThrow(expect.objectContaining({ code: "configuration_invalid" }))
  })
})
