export const CLUSTER_ERROR_CODES = [
  "configuration_invalid",
  "exposure_conflict",
  "exposure_owner_mismatch",
  "foreign_listener",
  "internal_failure",
  "member_not_registered",
  "process_nonce_conflict",
  "protocol_incompatible",
  "reconnect_exhausted",
  "state_invalid",
  "state_io_failed",
] as const

export type ClusterErrorCode = (typeof CLUSTER_ERROR_CODES)[number]

const SAFE_MESSAGES = {
  configuration_invalid: "Cluster configuration is invalid.",
  exposure_conflict: "The session exposure already has another live owner.",
  exposure_owner_mismatch: "The session exposure owner does not match the request.",
  foreign_listener: "The broker port is occupied by an incompatible listener.",
  internal_failure: "The cluster boundary failed closed.",
  member_not_registered: "The cluster member is not registered.",
  process_nonce_conflict: "The process nonce identifies conflicting process metadata.",
  protocol_incompatible: "The cluster protocol or broker epoch is incompatible.",
  reconnect_exhausted: "The bounded cluster reconnect budget is exhausted.",
  state_invalid: "Persisted cluster state is invalid.",
  state_io_failed: "Persisted cluster state could not be accessed safely.",
} satisfies Readonly<Record<ClusterErrorCode, string>>

export class ClusterError extends Error {
  override readonly name = "ClusterError"

  constructor(readonly code: ClusterErrorCode) {
    super(SAFE_MESSAGES[code])
  }
}

export function toClusterError(error: unknown): ClusterError {
  return error instanceof ClusterError ? error : new ClusterError("internal_failure")
}
