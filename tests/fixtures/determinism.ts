import {
  type MessageId,
  MessageIdSchema,
  type PermissionRequestId,
  PermissionRequestIdSchema,
  type ProcessInstanceNonce,
  ProcessInstanceNonceSchema,
  type QuestionRequestId,
  QuestionRequestIdSchema,
  type SessionId,
  SessionIdSchema,
  type UnixEpochMs,
  UnixEpochMsSchema,
} from "../../packages/contracts/src/index.ts"
import { FixtureConfigurationError } from "./errors.ts"

export interface Clock {
  now(): UnixEpochMs
}

export class DeterministicClock implements Clock {
  #current: UnixEpochMs

  constructor(start: number) {
    this.#current = UnixEpochMsSchema.parse(start)
  }

  now(): UnixEpochMs {
    return this.#current
  }

  advance(durationMs: number): void {
    if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
      throw new FixtureConfigurationError("durationMs")
    }
    this.#current = UnixEpochMsSchema.parse(this.#current + durationMs)
  }
}

export class DeterministicIds {
  #next = 0

  constructor(readonly seed: number) {
    if (!Number.isSafeInteger(seed) || seed < 0) {
      throw new FixtureConfigurationError("seed")
    }
  }

  session(): SessionId {
    return SessionIdSchema.parse(this.#opaque("session"))
  }

  message(): MessageId {
    return MessageIdSchema.parse(this.#opaque("message"))
  }

  permission(): PermissionRequestId {
    return PermissionRequestIdSchema.parse(this.#opaque("permission"))
  }

  question(): QuestionRequestId {
    return QuestionRequestIdSchema.parse(this.#opaque("question"))
  }

  processNonce(): ProcessInstanceNonce {
    const value = (this.seed * 1_000 + this.#next).toString(16).padStart(12, "0").slice(-12)
    this.#next += 1
    return ProcessInstanceNonceSchema.parse(`00000000-0000-4000-8000-${value}`)
  }

  #opaque(kind: string): string {
    const value = `fixture-${kind}-${this.seed}-${this.#next}`
    this.#next += 1
    return value
  }
}
