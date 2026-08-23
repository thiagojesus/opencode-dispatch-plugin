import type { ProcessExposure, ProcessInstanceNonce, SessionId } from "@opencode-dispatch/contracts"

import type { ClusterRegistrySnapshot } from "../cluster/registry.ts"
import type { HostSecret } from "../security/index.ts"
import type { TailscaleSetupState } from "../transport/tailscale/index.ts"

export interface ApiOpenCodeProcessPort {
  permissions(sessionId: unknown): Promise<unknown>
  questions(sessionId: unknown): Promise<unknown>
  promptAsync(sessionId: unknown, text: unknown): Promise<void>
  abort(sessionId: unknown): Promise<boolean>
  replyPermission(sessionId: unknown, requestId: unknown, decision: unknown): Promise<void>
  replyQuestion(sessionId: unknown, requestId: unknown, answers: unknown): Promise<void>
}

export interface ApiOpenCodePort extends ApiOpenCodeProcessPort {
  sessionIds(): readonly SessionId[]
  resolveOwner(sessionId: unknown): ProcessInstanceNonce
  forProcess(processNonce: ProcessInstanceNonce): ApiOpenCodeProcessPort
  get(sessionId: unknown): Promise<unknown>
  messages(sessionId: unknown): Promise<readonly unknown[]>
  status(sessionId: unknown): Promise<unknown>
  todos(sessionId: unknown): Promise<unknown>
}

export interface ApiClusterPort {
  snapshot(): ClusterRegistrySnapshot
  enable(exposure: ProcessExposure): Promise<void>
  disable(processNonce: ProcessInstanceNonce, sessionId: SessionId): Promise<void>
}

export type ApiRateLimitConfig = {
  readonly maxSubjects: number
  readonly mutationLimit: number
  readonly readLimit: number
  readonly windowMs: number
}

export type BrokerHttpRouterOptions = {
  readonly backendOrigin: string
  readonly cluster: ApiClusterPort
  readonly hostSecret: HostSecret
  readonly inspectTailscale: () => Promise<TailscaleSetupState>
  readonly now: () => number
  readonly openCode: ApiOpenCodePort
  readonly rateLimit?: ApiRateLimitConfig
}

export type BrokerRequestIngress = "direct" | "trusted_proxy"

export interface BrokerHttpRouter {
  handle(request: Request, ingress: BrokerRequestIngress): Promise<Response>
}
