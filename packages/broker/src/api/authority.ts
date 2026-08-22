import {
  type ProcessExposure,
  type ProcessInstanceNonce,
  type SessionId,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"

import { ApiHttpError, apiErrorFrom } from "./errors.ts"
import type { ApiClusterPort, ApiOpenCodePort } from "./ports.ts"

export type SessionAuthorityContext = {
  readonly exposure: ProcessExposure
  readonly processNonce: ProcessInstanceNonce
  readonly sessionId: SessionId
}

type SessionAuthorityOptions = {
  readonly cluster: ApiClusterPort
  readonly now: () => number
  readonly openCode: ApiOpenCodePort
}

export class SessionAuthority {
  readonly #cluster: ApiClusterPort
  readonly #now: () => number
  readonly #openCode: ApiOpenCodePort

  constructor(options: SessionAuthorityOptions) {
    this.#cluster = options.cluster
    this.#now = options.now
    this.#openCode = options.openCode
  }

  enabledExposures(): readonly ProcessExposure[] {
    const snapshot = this.#cluster.snapshot()
    const now = this.#now()
    return snapshot.exposures.filter((exposure) => {
      const member = snapshot.members.find(
        (candidate) => candidate.processNonce === exposure.processNonce,
      )
      if (member === undefined || member.expiresAt < now) return false
      try {
        return this.#openCode.resolveOwner(exposure.sessionId) === exposure.processNonce
      } catch {
        return false
      }
    })
  }

  require(sessionId: unknown): SessionAuthorityContext {
    const parsedSessionId = SessionIdSchema.safeParse(sessionId)
    if (!parsedSessionId.success) throw new ApiHttpError("REQUEST_INVALID")
    const snapshot = this.#cluster.snapshot()
    const exposure = snapshot.exposures.find(
      (candidate) => candidate.sessionId === parsedSessionId.data,
    )
    if (exposure === undefined) throw new ApiHttpError("SESSION_GONE")
    const member = snapshot.members.find(
      (candidate) => candidate.processNonce === exposure.processNonce,
    )
    if (member === undefined || member.expiresAt < this.#now()) {
      throw new ApiHttpError("SESSION_GONE")
    }
    let processNonce: ProcessInstanceNonce
    try {
      processNonce = this.#openCode.resolveOwner(parsedSessionId.data)
    } catch (error) {
      throw apiErrorFrom(error)
    }
    if (processNonce !== exposure.processNonce) {
      throw new ApiHttpError("OWNERSHIP_CONFLICT")
    }
    return { exposure, processNonce, sessionId: parsedSessionId.data }
  }

  assertCurrent(context: SessionAuthorityContext): void {
    const current = this.require(context.sessionId)
    if (current.processNonce !== context.processNonce) {
      throw new ApiHttpError("SESSION_GONE")
    }
  }
}
