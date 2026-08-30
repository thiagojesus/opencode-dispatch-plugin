import { randomUUID } from "node:crypto"

import {
  type BrokerEpoch,
  IdempotencyKeySchema,
  PROTOCOL_VERSION,
  type ProcessExposure,
  type ProcessInstanceNonce,
  type ProcessLifecycleMessage,
  type SessionId,
} from "@opencode-dispatch/contracts"
import type { BasicAuthorization, OpenCodeSessionSignal } from "../opencode/index.ts"
import { createInternalAuthResponse, type HostSecret } from "../security/index.ts"
import { ClusterError } from "./errors.ts"
import { clusterAuthBinding } from "./protocol.ts"
import { ClusterSocketChannel } from "./socket-channel.ts"

type RegistrationMessage = Extract<ProcessLifecycleMessage, { readonly type: "process.register" }>
type HeartbeatMessage = Extract<ProcessLifecycleMessage, { readonly type: "process.heartbeat" }>
type UnregisterMessage = Extract<ProcessLifecycleMessage, { readonly type: "process.unregister" }>

type ClusterConnectionOptions = {
  readonly authorization?: BasicAuthorization
  readonly brokerEpoch: BrokerEpoch
  readonly brokerUrl: string
  readonly exposures: readonly ProcessExposure[]
  readonly hostSecret: HostSecret
  readonly onClose: () => void
  readonly registration: RegistrationMessage
  readonly signals: readonly OpenCodeSessionSignal[]
  readonly timeoutMs: number
}

export class ClusterConnection {
  readonly #brokerEpoch: BrokerEpoch
  readonly #channel: ClusterSocketChannel

  private constructor(brokerEpoch: BrokerEpoch, channel: ClusterSocketChannel) {
    this.#brokerEpoch = brokerEpoch
    this.#channel = channel
  }

  static async connect(options: ClusterConnectionOptions): Promise<ClusterConnection> {
    const channel = await ClusterSocketChannel.open(
      options.brokerEpoch,
      options.brokerUrl,
      options.onClose,
      options.timeoutMs,
    )
    const challenge = await channel.nextFrame()
    if (challenge.type !== "auth.challenge") {
      channel.close()
      throw new ClusterError("protocol_incompatible")
    }
    const accepted = channel.nextFrame()
    channel.send({
      type: "auth.response",
      version: PROTOCOL_VERSION,
      brokerEpoch: options.brokerEpoch,
      response: createInternalAuthResponse(
        options.hostSecret,
        challenge.challenge,
        clusterAuthBinding(options.brokerEpoch),
      ),
    })
    if ((await accepted).type !== "auth.accepted") {
      channel.close()
      throw new ClusterError("protocol_incompatible")
    }
    const registered = channel.nextFrame()
    channel.send({
      type: "member.register",
      version: PROTOCOL_VERSION,
      brokerEpoch: options.brokerEpoch,
      lifecycle: options.registration,
      exposures: options.exposures,
      signals: options.signals,
      ...(options.authorization === undefined ? {} : { authorization: options.authorization }),
    })
    if ((await registered).type !== "member.registered") {
      channel.close()
      throw new ClusterError("protocol_incompatible")
    }
    return new ClusterConnection(options.brokerEpoch, channel)
  }

  heartbeat(message: HeartbeatMessage): void {
    this.#channel.send({
      type: "member.heartbeat",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#brokerEpoch,
      lifecycle: message,
    })
  }

  enable(exposure: ProcessExposure): Promise<void> {
    const requestId = IdempotencyKeySchema.parse(randomUUID())
    return this.#channel.request(requestId, {
      type: "exposure.enable",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#brokerEpoch,
      requestId,
      exposure,
    })
  }

  disable(processNonce: ProcessInstanceNonce, sessionId: SessionId, sentAt: number): Promise<void> {
    const requestId = IdempotencyKeySchema.parse(randomUUID())
    return this.#channel.request(requestId, {
      type: "exposure.disable",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#brokerEpoch,
      requestId,
      processNonce,
      sessionId,
      sentAt,
    })
  }

  publishOpenCodeSignal(
    processNonce: ProcessInstanceNonce,
    signal: OpenCodeSessionSignal,
  ): Promise<void> {
    const requestId = IdempotencyKeySchema.parse(randomUUID())
    return this.#channel.request(requestId, {
      type: "opencode.event",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#brokerEpoch,
      requestId,
      processNonce,
      signal,
    })
  }

  unregister(message: UnregisterMessage): Promise<void> {
    const requestId = IdempotencyKeySchema.parse(randomUUID())
    return this.#channel.request(requestId, {
      type: "member.unregister",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#brokerEpoch,
      requestId,
      lifecycle: message,
    })
  }

  close(): void {
    this.#channel.close()
  }
}
