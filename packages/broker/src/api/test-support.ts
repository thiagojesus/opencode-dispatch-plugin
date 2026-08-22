import {
  BrokerEpochSchema,
  CONTROL_CAPABILITY,
  LoopbackServerUrlSchema,
  type ProcessExposure,
  ProcessExposureSchema,
  ProcessIdSchema,
  type ProcessInstanceNonce,
  ProcessInstanceNonceSchema,
  type SessionId,
  SessionIdSchema,
  TailscaleLoginSchema,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"
import type { ClusterMemberRecord } from "../cluster/registry.ts"
import { OpenCodeAdapterError } from "../opencode/index.ts"
import { HostSecret } from "../security/index.ts"
import type { TailscaleReadySetup } from "../transport/tailscale/index.ts"
import type { ApiClusterPort, ApiOpenCodePort, BrokerHttpRouterOptions } from "./ports.ts"

export const NOW = 1_754_352_000_000
export const SESSION_ID = SessionIdSchema.parse("ses-api-primary")
export const SECOND_SESSION_ID = SessionIdSchema.parse("ses-api-secondary")
export const PROCESS_NONCE = ProcessInstanceNonceSchema.parse(
  "00000000-0000-4000-8000-000000000201",
)
export const SECOND_PROCESS_NONCE = ProcessInstanceNonceSchema.parse(
  "00000000-0000-4000-8000-000000000202",
)
export const IDEMPOTENCY_KEY = "550e8400-e29b-41d4-a716-446655440010"
export const SECOND_IDEMPOTENCY_KEY = "550e8400-e29b-41d4-a716-446655440011"
export const STABLE_ORIGIN = "https://workstation.example.ts.net"
export const LOGIN = "fixture-user@example.test"

export const READY_SETUP = {
  kind: "ready",
  allowedLogin: TailscaleLoginSchema.parse(LOGIN),
  grantVerification: "per_request",
  machineName: "workstation",
  stableUrl: STABLE_ORIGIN,
} satisfies TailscaleReadySetup

export function exposure(
  sessionId: SessionId = SESSION_ID,
  processNonce: ProcessInstanceNonce = PROCESS_NONCE,
): ProcessExposure {
  return ProcessExposureSchema.parse({
    version: 1,
    sessionId,
    processNonce,
    title: sessionId === SESSION_ID ? "Primary session" : "Secondary session",
    enabledAt: NOW,
  })
}

export class FakeCluster implements ApiClusterPort {
  readonly brokerEpoch = BrokerEpochSchema.parse("00000000-0000-4000-8000-000000000200")
  exposures: ProcessExposure[] = [exposure()]
  members: ClusterMemberRecord[] = [
    {
      processNonce: PROCESS_NONCE,
      serverUrl: LoopbackServerUrlSchema.parse("http://127.0.0.1:41101"),
      pid: ProcessIdSchema.parse(2201),
      startedAt: UnixEpochMsSchema.parse(NOW),
      lastSeenAt: NOW,
      expiresAt: NOW + 15_000,
    },
  ]

  snapshot() {
    return {
      brokerEpoch: this.brokerEpoch,
      members: this.members,
      exposures: this.exposures,
    }
  }

  async enable(candidate: ProcessExposure): Promise<void> {
    const existing = this.exposures.find((item) => item.sessionId === candidate.sessionId)
    if (existing === undefined) this.exposures.push(candidate)
  }

  async disable(processNonce: ProcessInstanceNonce, sessionId: SessionId): Promise<void> {
    this.exposures = this.exposures.filter(
      (candidate) => candidate.sessionId !== sessionId || candidate.processNonce !== processNonce,
    )
  }
}

export class FakeOpenCode implements ApiOpenCodePort {
  owner = PROCESS_NONCE
  ownerFailure: "ownership_ambiguous" | "ownership_missing" | undefined
  promptCalls = 0
  abortCalls = 0
  permissionCalls = 0
  questionCalls = 0
  onPrompt: (() => void) | undefined
  promptGate: Promise<void> | undefined
  upstreamFailure = false

  sessionIds(): readonly SessionId[] {
    return [SESSION_ID, SECOND_SESSION_ID]
  }

  resolveOwner(_sessionId: unknown): ProcessInstanceNonce {
    if (this.ownerFailure !== undefined) throw new OpenCodeAdapterError(this.ownerFailure)
    return this.owner
  }

  async get(sessionId: unknown): Promise<unknown> {
    const id = SessionIdSchema.parse(sessionId)
    return {
      id,
      title: id === SESSION_ID ? "Primary session" : "Secondary session",
      time: { updated: NOW },
    }
  }

  async messages(): Promise<readonly unknown[]> {
    return [
      {
        info: { id: "msg-user", sessionID: SESSION_ID, role: "user", time: { created: NOW } },
        parts: [
          {
            id: "part-user",
            messageID: "msg-user",
            sessionID: SESSION_ID,
            type: "text",
            text: "Continue.",
          },
        ],
      },
    ]
  }

  async status(): Promise<unknown> {
    return { type: "busy" }
  }

  async todos(): Promise<unknown> {
    return [{ content: "Exercise API", status: "in_progress", priority: "high" }]
  }

  async permissions(): Promise<unknown> {
    return [{ id: "perm-api", sessionID: SESSION_ID, action: "bash", resources: ["bun test"] }]
  }

  async questions(): Promise<unknown> {
    return [
      {
        id: "question-api",
        sessionID: SESSION_ID,
        questions: [
          {
            header: "Continue",
            question: "Continue the task?",
            options: [{ label: "Continue", description: "Continue safely." }],
          },
        ],
      },
    ]
  }

  async promptAsync(): Promise<void> {
    this.promptCalls += 1
    this.onPrompt?.()
    if (this.upstreamFailure) throw new OpenCodeAdapterError("upstream_failure")
    await this.promptGate
  }

  async abort(): Promise<boolean> {
    this.abortCalls += 1
    return true
  }

  async replyPermission(): Promise<void> {
    this.permissionCalls += 1
  }

  async replyQuestion(): Promise<void> {
    this.questionCalls += 1
  }
}

export function trustedHeaders(login = LOGIN): Headers {
  return new Headers({
    host: "workstation.example.ts.net",
    origin: STABLE_ORIGIN,
    "tailscale-app-capabilities": JSON.stringify({ [CONTROL_CAPABILITY]: [{}] }),
    "tailscale-user-login": login,
    "tailscale-user-name": "Fixture User",
  })
}

export function routerOptions(
  cluster: FakeCluster,
  openCode: FakeOpenCode,
): BrokerHttpRouterOptions {
  return {
    backendOrigin: "http://127.0.0.1:43110",
    cluster,
    hostSecret: HostSecret.generate(),
    inspectTailscale: async () => READY_SETUP,
    now: () => NOW,
    openCode,
    rateLimit: { maxSubjects: 16, mutationLimit: 4, readLimit: 20, windowMs: 60_000 },
  }
}
