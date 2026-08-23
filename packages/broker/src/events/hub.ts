import {
  type BrokerEpoch,
  type EventStreamScope,
  type EventStreamServerFrame,
  EventStreamServerFrameSchema,
  type EventStreamSubscribe,
  EventStreamSubscribeSchema,
  MonotonicSequenceSchema,
  type NormalizedEvent,
  type NormalizedEventEnvelope,
  NormalizedEventEnvelopeSchema,
  PROTOCOL_VERSION,
  type SessionId,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"

type EventSink = {
  readonly close: (code: number, reason: string) => void
  readonly send: (frame: EventStreamServerFrame) => void
}

type EventHubOptions = {
  readonly brokerEpoch: BrokerEpoch
  readonly now: () => number
  readonly replayLimit: number
}

type Channel = {
  sequence: number
  readonly replay: NormalizedEventEnvelope[]
  readonly subscribers: Set<EventSink>
}

export type EventPosition = {
  readonly brokerEpoch: BrokerEpoch
  readonly sequence: ReturnType<typeof MonotonicSequenceSchema.parse>
}

const SESSION_REVOKED_CLOSE_CODE = 4_003

function scopeKey(scope: EventStreamScope): string {
  switch (scope.type) {
    case "sessions":
      return "sessions"
    case "session":
      return `session:${scope.sessionId}`
  }
}

export class SessionEventHub {
  readonly #brokerEpoch: BrokerEpoch
  readonly #channels = new Map<string, Channel>()
  readonly #now: () => number
  readonly #replayLimit: number

  constructor(options: EventHubOptions) {
    if (!Number.isSafeInteger(options.replayLimit) || options.replayLimit < 1) {
      throw new RangeError("Replay limit must be a positive safe integer")
    }
    this.#brokerEpoch = options.brokerEpoch
    this.#now = options.now
    this.#replayLimit = options.replayLimit
  }

  position(scope: EventStreamScope): EventPosition {
    return {
      brokerEpoch: this.#brokerEpoch,
      sequence: MonotonicSequenceSchema.parse(this.#channel(scope).sequence),
    }
  }

  publish(
    scope: EventStreamScope,
    sessionId: SessionId,
    event: NormalizedEvent,
  ): NormalizedEventEnvelope {
    const channel = this.#channel(scope)
    channel.sequence += 1
    const envelope = NormalizedEventEnvelopeSchema.parse({
      type: "event",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#brokerEpoch,
      sequence: channel.sequence,
      emittedAt: UnixEpochMsSchema.parse(this.#now()),
      sessionId,
      event,
    })
    channel.replay.push(envelope)
    if (channel.replay.length > this.#replayLimit) {
      channel.replay.splice(0, channel.replay.length - this.#replayLimit)
    }
    for (const subscriber of channel.subscribers) {
      subscriber.send(envelope)
    }
    return envelope
  }

  subscribe(input: unknown, sink: EventSink): () => void {
    const subscription = EventStreamSubscribeSchema.parse(input)
    const channel = this.#channel(subscription.scope)
    const frame = this.#initialFrame(subscription, channel)
    sink.send(frame)
    if (frame.type === "resync") return () => undefined
    channel.subscribers.add(sink)
    return () => channel.subscribers.delete(sink)
  }

  revoke(
    sessionId: SessionId,
    reason: Extract<NormalizedEvent, { type: "session.revoked" }>["reason"],
  ): void {
    const event = { type: "session.revoked", reason } as const
    this.publish({ type: "sessions" }, sessionId, event)
    const scope = { type: "session", sessionId } as const
    const channel = this.#channel(scope)
    this.publish(scope, sessionId, event)
    for (const subscriber of channel.subscribers) {
      subscriber.close(SESSION_REVOKED_CLOSE_CODE, "session_revoked")
    }
    channel.subscribers.clear()
  }

  #channel(scope: EventStreamScope): Channel {
    const key = scopeKey(scope)
    const current = this.#channels.get(key)
    if (current !== undefined) return current
    const created: Channel = { replay: [], sequence: 0, subscribers: new Set() }
    this.#channels.set(key, created)
    return created
  }

  #initialFrame(subscription: EventStreamSubscribe, channel: Channel): EventStreamServerFrame {
    if (subscription.brokerEpoch !== this.#brokerEpoch) {
      return this.#resync(channel.sequence, "epoch_changed")
    }
    if (subscription.sequence > channel.sequence) {
      return this.#resync(channel.sequence, "sequence_gap")
    }
    const oldest = channel.replay[0]?.sequence
    if (oldest !== undefined && subscription.sequence < oldest - 1) {
      return this.#resync(channel.sequence, "replay_unavailable")
    }
    const events = channel.replay.filter((event) => event.sequence > subscription.sequence)
    if (events.length > 0) {
      return EventStreamServerFrameSchema.parse({
        type: "replay",
        version: PROTOCOL_VERSION,
        brokerEpoch: this.#brokerEpoch,
        sequence: channel.sequence,
        events,
      })
    }
    return EventStreamServerFrameSchema.parse({
      type: "ready",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#brokerEpoch,
      sequence: channel.sequence,
    })
  }

  #resync(sequence: number, reason: "epoch_changed" | "sequence_gap" | "replay_unavailable") {
    return EventStreamServerFrameSchema.parse({
      type: "resync",
      version: PROTOCOL_VERSION,
      brokerEpoch: this.#brokerEpoch,
      sequence,
      reason,
    })
  }
}
