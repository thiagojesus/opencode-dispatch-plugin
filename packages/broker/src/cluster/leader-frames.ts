import {
  type BrokerEpoch,
  PROTOCOL_VERSION,
  type ProcessInstanceNonce,
} from "@opencode-dispatch/contracts"

import type { InternalAuthChallenge, SecurityErrorCode } from "../security/index.ts"
import type { ClusterErrorCode } from "./errors.ts"

export type LeaderSocketData = {
  authenticated: boolean
  readonly challenge: InternalAuthChallenge
  processNonce?: ProcessInstanceNonce
}

export function sendServerFrame(
  socket: Bun.ServerWebSocket<LeaderSocketData>,
  frame: object,
): void {
  socket.send(JSON.stringify(frame))
}

export function sendAcknowledged(
  socket: Bun.ServerWebSocket<LeaderSocketData>,
  brokerEpoch: BrokerEpoch,
  requestId: string,
): void {
  sendServerFrame(socket, {
    type: "acknowledged",
    version: PROTOCOL_VERSION,
    brokerEpoch,
    requestId,
  })
}

export function sendClusterError(
  socket: Bun.ServerWebSocket<LeaderSocketData>,
  brokerEpoch: BrokerEpoch,
  code: ClusterErrorCode | SecurityErrorCode,
  requestId?: string,
): void {
  sendServerFrame(socket, {
    type: "error",
    version: PROTOCOL_VERSION,
    brokerEpoch,
    code,
    ...(requestId === undefined ? {} : { requestId }),
  })
}
