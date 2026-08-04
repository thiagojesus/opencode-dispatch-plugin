import { describe, expect, test } from "bun:test"
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

  test("fails closed when the challenge clock is invalid", () => {
    const verifier = createVerifier(() => Number.NaN)

    const issueChallenge = () => verifier.issueChallenge()

    expect(issueChallenge).toThrow(SecurityError)
    expect(issueChallenge).toThrow(expect.objectContaining({ code: "configuration_invalid" }))
  })
})
