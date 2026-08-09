import { Buffer } from "node:buffer"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { type SecurityDecision, SecurityError, securityAllowed, securityDenied } from "./errors.ts"
import type { HostSecret } from "./host-secret.ts"

const NONCE_BYTES = 16
const NONCE_LENGTH = 22
const SIGNATURE_LENGTH = 43
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u
const BINDING_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u

export type InternalAuthChallenge = {
  readonly issuedAtMs: number
  readonly nonce: string
}

export type InternalAuthResponse = InternalAuthChallenge & {
  readonly signature: string
}

export type InternalAuthPolicy = {
  readonly challengeTtlMs: number
  readonly maxChallenges: number
  readonly now: () => number
}

export type AuthenticatedControl = {
  readonly kind: "authenticated"
}

function isValidBinding(binding: string): boolean {
  return BINDING_PATTERN.test(binding)
}

function parseInternalAuthResponse(value: unknown): InternalAuthResponse | undefined {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      !("issuedAtMs" in value) ||
      typeof value.issuedAtMs !== "number" ||
      !("nonce" in value) ||
      typeof value.nonce !== "string" ||
      !("signature" in value) ||
      typeof value.signature !== "string"
    ) {
      return undefined
    }
    return {
      issuedAtMs: value.issuedAtMs,
      nonce: value.nonce,
      signature: value.signature,
    }
  } catch {
    return undefined
  }
}

function canonicalChallenge(challenge: InternalAuthChallenge, binding: string): string {
  return `v1\n${challenge.issuedAtMs}\n${challenge.nonce}\n${binding}`
}

export function createInternalAuthResponse(
  secret: HostSecret,
  challenge: InternalAuthChallenge,
  binding: string,
): InternalAuthResponse {
  if (!isValidBinding(binding)) {
    throw new SecurityError("configuration_invalid", "verify_internal_auth")
  }
  const signature = secret
    .authenticate(canonicalChallenge(challenge, binding))
    .toString("base64url")
  return { ...challenge, signature }
}

export class InternalAuthVerifier {
  readonly #pending = new Map<string, InternalAuthChallenge>()
  readonly #policy: InternalAuthPolicy
  readonly #secret: HostSecret
  readonly #used = new Map<string, number>()

  constructor(secret: HostSecret, policy: InternalAuthPolicy) {
    if (
      !Number.isSafeInteger(policy.challengeTtlMs) ||
      policy.challengeTtlMs <= 0 ||
      !Number.isSafeInteger(policy.maxChallenges) ||
      policy.maxChallenges <= 0
    ) {
      throw new SecurityError("configuration_invalid", "verify_internal_auth")
    }
    this.#secret = secret
    this.#policy = policy
  }

  issueChallenge(): InternalAuthChallenge {
    const now = this.#policy.now()
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new SecurityError("configuration_invalid", "verify_internal_auth")
    }
    this.#prune(now)
    if (this.#pending.size + this.#used.size >= this.#policy.maxChallenges) {
      throw new SecurityError("auth_capacity_exhausted", "verify_internal_auth")
    }
    const nonce = randomBytes(NONCE_BYTES).toString("base64url")
    if (this.#pending.has(nonce) || this.#used.has(nonce)) {
      throw new SecurityError("auth_capacity_exhausted", "verify_internal_auth")
    }
    const challenge = { issuedAtMs: now, nonce }
    this.#pending.set(nonce, challenge)
    return challenge
  }

  verify(response: unknown, binding: string): SecurityDecision<AuthenticatedControl> {
    const now = this.#policy.now()
    if (!Number.isSafeInteger(now) || now < 0) {
      return securityDenied("configuration_invalid", "verify_internal_auth")
    }
    const parsedResponse = parseInternalAuthResponse(response)
    if (parsedResponse === undefined) {
      return securityDenied("auth_malformed", "verify_internal_auth")
    }
    if (
      !Number.isSafeInteger(parsedResponse.issuedAtMs) ||
      parsedResponse.nonce.length !== NONCE_LENGTH ||
      !BASE64URL_PATTERN.test(parsedResponse.nonce) ||
      parsedResponse.signature.length !== SIGNATURE_LENGTH ||
      !BASE64URL_PATTERN.test(parsedResponse.signature) ||
      !isValidBinding(binding)
    ) {
      return securityDenied("auth_malformed", "verify_internal_auth")
    }
    const received = Buffer.from(parsedResponse.signature, "base64url")
    if (received.toString("base64url") !== parsedResponse.signature) {
      return securityDenied("auth_malformed", "verify_internal_auth")
    }
    if (this.#used.has(parsedResponse.nonce)) {
      return securityDenied("auth_replayed", "verify_internal_auth")
    }
    const challenge = this.#pending.get(parsedResponse.nonce)
    if (challenge === undefined || challenge.issuedAtMs !== parsedResponse.issuedAtMs) {
      return securityDenied("auth_invalid", "verify_internal_auth")
    }
    if (
      now < parsedResponse.issuedAtMs ||
      now - parsedResponse.issuedAtMs > this.#policy.challengeTtlMs
    ) {
      this.#pending.delete(parsedResponse.nonce)
      return securityDenied("auth_expired", "verify_internal_auth")
    }
    const expected = this.#secret.authenticate(canonicalChallenge(challenge, binding))
    const comparable =
      received.byteLength === expected.byteLength ? received : Buffer.alloc(expected.byteLength)
    const matches =
      timingSafeEqual(expected, comparable) && received.byteLength === expected.byteLength
    if (!matches) {
      return securityDenied("auth_invalid", "verify_internal_auth")
    }
    this.#pending.delete(parsedResponse.nonce)
    this.#used.set(parsedResponse.nonce, parsedResponse.issuedAtMs + this.#policy.challengeTtlMs)
    return securityAllowed({ kind: "authenticated" })
  }

  #prune(now: number): void {
    for (const [nonce, challenge] of this.#pending) {
      if (challenge.issuedAtMs + this.#policy.challengeTtlMs < now) {
        this.#pending.delete(nonce)
      }
    }
    for (const [nonce, expiresAtMs] of this.#used) {
      if (expiresAtMs < now) {
        this.#used.delete(nonce)
      }
    }
  }
}
