import type { ProcessInstanceNonce } from "@opencode-dispatch/contracts"

import { ClusterError } from "./errors.ts"
import type { LeaderSocketData } from "./leader-frames.ts"

export function requireAuthenticated(socket: Bun.ServerWebSocket<LeaderSocketData>): void {
  if (!socket.data.authenticated) throw new ClusterError("protocol_incompatible")
}

export function requireOwner(
  socket: Bun.ServerWebSocket<LeaderSocketData>,
  processNonce: ProcessInstanceNonce,
): void {
  requireAuthenticated(socket)
  if (socket.data.processNonce !== processNonce) {
    throw new ClusterError("exposure_owner_mismatch")
  }
}
