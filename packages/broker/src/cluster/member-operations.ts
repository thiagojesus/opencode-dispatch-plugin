import {
  ProcessExposureSchema,
  type ProcessInstanceNonce,
  SessionIdSchema,
} from "@opencode-dispatch/contracts"

import { type OpenCodeAdapter, OpenCodeSessionSignalSchema } from "../opencode/index.ts"
import type { ClusterConnection } from "./connection.ts"
import { ClusterError, toClusterError } from "./errors.ts"
import type { LeaderServer } from "./leader.ts"
import type { MemberState } from "./member-state.ts"

type MemberOperationsOptions = {
  readonly connection: () => ClusterConnection
  readonly leader: () => LeaderServer | undefined
  readonly processNonce: ProcessInstanceNonce
  readonly state: MemberState
}

export class MemberOperations {
  readonly #connection: () => ClusterConnection
  readonly #leader: () => LeaderServer | undefined
  readonly #processNonce: ProcessInstanceNonce
  readonly #state: MemberState

  constructor(options: MemberOperationsOptions) {
    this.#connection = options.connection
    this.#leader = options.leader
    this.#processNonce = options.processNonce
    this.#state = options.state
  }

  async enableExposure(input: {
    readonly enabledAt: unknown
    readonly sessionId: unknown
    readonly title: unknown
  }): Promise<void> {
    const exposure = ProcessExposureSchema.parse({
      version: 1,
      processNonce: this.#processNonce,
      sessionId: input.sessionId,
      title: input.title,
      enabledAt: input.enabledAt,
    })
    this.#state.addExposure(exposure)
    try {
      await this.#connection().enable(exposure)
    } catch (error) {
      this.#state.removeExposure(exposure.sessionId)
      throw error instanceof ClusterError ? error : toClusterError(error)
    }
  }

  async disableExposure(sessionId: unknown): Promise<void> {
    const parsedSessionId = SessionIdSchema.parse(sessionId)
    await this.#connection().disable(this.#processNonce, parsedSessionId, Date.now())
    this.#state.removeExposure(parsedSessionId)
  }

  async publishOpenCodeSignal(signal: unknown): Promise<void> {
    const parsed = OpenCodeSessionSignalSchema.parse(signal)
    await this.#connection().publishOpenCodeSignal(this.#processNonce, parsed)
    this.#state.setSignal(parsed)
  }

  authoritativeOpenCode(): OpenCodeAdapter | undefined {
    return this.#leader()?.openCode
  }
}
