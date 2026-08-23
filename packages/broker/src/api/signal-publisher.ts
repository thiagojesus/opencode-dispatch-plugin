import type { ProcessInstanceNonce } from "@opencode-dispatch/contracts"

import type { OpenCodeSessionSignal } from "../opencode/events.ts"
import type { SessionAuthority } from "./authority.ts"
import type { ApiEventPort, BrokerHttpRouterOptions } from "./ports.ts"
import type { SessionReadService } from "./read-service.ts"

type SignalPublisherOptions = BrokerHttpRouterOptions & { readonly events: ApiEventPort }

export function createSignalPublisher(
  options: SignalPublisherOptions,
  authority: SessionAuthority,
  reads: SessionReadService,
): (processNonce: ProcessInstanceNonce, signal: OpenCodeSessionSignal) => Promise<void> {
  return async (processNonce, signal) => {
    const exposure = options.cluster
      .snapshot()
      .exposures.find((candidate) => candidate.sessionId === signal.sessionId)
    if (exposure === undefined) return
    if (exposure.processNonce !== processNonce) {
      try {
        if (options.openCode.resolveOwner(signal.sessionId) === processNonce) {
          options.events.revoke(signal.sessionId, "ownership_lost")
        }
      } catch {
        return
      }
      return
    }
    let context: ReturnType<SessionAuthority["require"]>
    try {
      context = authority.require(signal.sessionId)
    } catch {
      return
    }
    if (context.processNonce !== processNonce) return
    let snapshot: Awaited<ReturnType<SessionReadService["snapshot"]>>
    try {
      snapshot = await reads.snapshot(context.sessionId)
    } catch {
      return
    }
    const event = { type: "session.updated", session: snapshot.session } as const
    options.events.publish({ type: "sessions" }, context.sessionId, event)
    options.events.publish(
      { type: "session", sessionId: context.sessionId },
      context.sessionId,
      event,
    )
  }
}
