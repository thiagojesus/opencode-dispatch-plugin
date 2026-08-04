import { type SecurityDecision, SecurityError, securityAllowed, securityDenied } from "./errors.ts"

export type RateLimitPolicy = {
  readonly limit: number
  readonly maxSubjects: number
  readonly now: () => number
  readonly windowMs: number
}

export type RatePermit = {
  readonly kind: "rate_permit"
  readonly remaining: number
  readonly resetAtMs: number
}

type WindowState = {
  readonly count: number
  readonly resetAtMs: number
}

export class FixedWindowRateLimiter {
  readonly #policy: RateLimitPolicy
  readonly #windows = new Map<string, WindowState>()

  constructor(policy: RateLimitPolicy) {
    if (
      !Number.isSafeInteger(policy.limit) ||
      policy.limit <= 0 ||
      !Number.isSafeInteger(policy.maxSubjects) ||
      policy.maxSubjects <= 0 ||
      !Number.isSafeInteger(policy.windowMs) ||
      policy.windowMs <= 0
    ) {
      throw new SecurityError("configuration_invalid", "rate_limit")
    }
    this.#policy = policy
  }

  consume(subject: string): SecurityDecision<RatePermit> {
    const now = this.#policy.now()
    if (!Number.isSafeInteger(now) || now < 0) {
      return securityDenied("configuration_invalid", "rate_limit")
    }
    if (subject.length === 0 || subject.length > 256) {
      return securityDenied("request_rate_limited", "rate_limit")
    }
    this.#prune(now)
    const current = this.#windows.get(subject)
    if (current === undefined) {
      if (this.#windows.size >= this.#policy.maxSubjects) {
        return securityDenied("request_rate_limited", "rate_limit")
      }
      const resetAtMs = now + this.#policy.windowMs
      if (!Number.isSafeInteger(resetAtMs)) {
        return securityDenied("configuration_invalid", "rate_limit")
      }
      this.#windows.set(subject, { count: 1, resetAtMs })
      return securityAllowed({
        kind: "rate_permit",
        remaining: this.#policy.limit - 1,
        resetAtMs,
      })
    }
    if (current.count >= this.#policy.limit) {
      return securityDenied("request_rate_limited", "rate_limit")
    }
    const nextCount = current.count + 1
    this.#windows.set(subject, { count: nextCount, resetAtMs: current.resetAtMs })
    return securityAllowed({
      kind: "rate_permit",
      remaining: this.#policy.limit - nextCount,
      resetAtMs: current.resetAtMs,
    })
  }

  #prune(now: number): void {
    for (const [subject, state] of this.#windows) {
      if (state.resetAtMs <= now) {
        this.#windows.delete(subject)
      }
    }
  }
}
