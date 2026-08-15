import { randomUUID } from "node:crypto"

import {
  BrokerEpochSchema,
  type DispatchConfig,
  PROTOCOL_VERSION,
} from "@opencode-dispatch/contracts"

import type { HostSecret } from "../security/index.ts"
import { ClusterError } from "./errors.ts"
import { LeaderServer } from "./leader.ts"
import { CLUSTER_SERVICE, type ClusterHealth, ClusterHealthSchema } from "./protocol.ts"
import { type ClusterRegistrySnapshot, MembershipRegistry } from "./registry.ts"
import type { ClusterStateStore } from "./state-store.ts"

type ElectionOptions = {
  readonly brokerUrl: string
  readonly config: DispatchConfig
  readonly hostSecret: HostSecret
  readonly onFailure: (error: ClusterError) => void
  readonly onSnapshot: (snapshot: ClusterRegistrySnapshot) => void
  readonly stateStore: ClusterStateStore
}

export type ElectionResult = {
  readonly health: ClusterHealth
  readonly leader: LeaderServer | undefined
  readonly leaderSnapshot: ClusterRegistrySnapshot | undefined
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE"
}

async function probeHealth(options: ElectionOptions): Promise<ClusterHealth> {
  let response: Response
  try {
    response = await fetch(`${options.brokerUrl}/.well-known/opencode-dispatch/cluster/health`, {
      signal: AbortSignal.timeout(Math.min(options.config.registration.ttlMs, 5_000)),
    })
  } catch {
    throw new ClusterError("internal_failure")
  }
  if (!response.ok) {
    throw new ClusterError("foreign_listener")
  }
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new ClusterError("foreign_listener")
  }
  const parsed = ClusterHealthSchema.safeParse(value)
  if (!parsed.success) {
    throw new ClusterError("foreign_listener")
  }
  return parsed.data
}

export async function electOrDiscover(options: ElectionOptions): Promise<ElectionResult> {
  const brokerEpoch = BrokerEpochSchema.parse(randomUUID())
  try {
    const registry = new MembershipRegistry({
      brokerEpoch,
      now: Date.now,
      restoredState: await options.stateStore.load(),
      ttlMs: options.config.registration.ttlMs,
    })
    const leader = new LeaderServer({
      config: options.config,
      hostSecret: options.hostSecret,
      now: Date.now,
      onFailure: options.onFailure,
      onSnapshot: options.onSnapshot,
      registry,
      stateStore: options.stateStore,
    })
    return {
      health: ClusterHealthSchema.parse({
        type: "cluster.health",
        version: PROTOCOL_VERSION,
        service: CLUSTER_SERVICE,
        brokerEpoch,
      }),
      leader,
      leaderSnapshot: registry.snapshot(),
    }
  } catch (error) {
    if (!isAddressInUse(error)) {
      throw error
    }
    return {
      health: await probeHealth(options),
      leader: undefined,
      leaderSnapshot: undefined,
    }
  }
}
