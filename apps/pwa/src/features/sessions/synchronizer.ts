import {
  type BrokerEpoch,
  type EventStreamScope,
  EventStreamServerFrameSchema,
  type MonotonicSequence,
  PROTOCOL_VERSION,
} from "@opencode-dispatch/contracts"

import { BoundedRecovery, type RecoveryRuntime } from "./bounded-recovery"

export type SnapshotPosition = {
  readonly brokerEpoch: BrokerEpoch
  readonly sequence: MonotonicSequence
}

export type SynchronizerState<T extends SnapshotPosition> =
  | { readonly type: "loading" }
  | { readonly type: "ready"; readonly snapshot: T }
  | { readonly type: "reconnecting"; readonly snapshot?: T }
  | { readonly type: "offline"; readonly snapshot?: T }
  | { readonly type: "revoked" }
  | { readonly type: "error" }

export type StreamConnection = { readonly close: () => void }

export type SessionSynchronizerOptions<T extends SnapshotPosition> = {
  readonly load: (signal: AbortSignal) => Promise<T>
  readonly openStream: (
    position: SnapshotPosition,
    onFrame: (frame: unknown) => void,
    onClose: () => void,
  ) => StreamConnection
  readonly recovery?: RecoveryRuntime
}

export class SessionSynchronizer<T extends SnapshotPosition> {
  readonly #listeners = new Set<(state: SynchronizerState<T>) => void>()
  readonly #options: SessionSynchronizerOptions<T>
  readonly #recovery: BoundedRecovery
  #abort: AbortController | undefined
  #generation = 0
  #online = true
  #snapshot: T | undefined
  #state: SynchronizerState<T> = { type: "loading" }
  #stopped = true
  #stream: StreamConnection | undefined

  constructor(options: SessionSynchronizerOptions<T>) {
    this.#options = options
    this.#recovery = new BoundedRecovery(options.recovery)
  }

  get state(): SynchronizerState<T> {
    return this.#state
  }

  subscribe(listener: (state: SynchronizerState<T>) => void): () => void {
    this.#listeners.add(listener)
    listener(this.#state)
    return () => this.#listeners.delete(listener)
  }

  start(): void {
    this.#stopped = false
    if (!this.#online) return
    void this.refresh()
  }

  async refresh(): Promise<void> {
    if (this.#state.type === "revoked") return
    if (!this.#online) {
      this.#setState(
        this.#snapshot === undefined
          ? { type: "offline" }
          : { type: "offline", snapshot: this.#snapshot },
      )
      return
    }
    this.#recovery.reset()
    await this.#loadAndAttach()
  }

  visibilityChanged(visible: boolean): void {
    if (visible) this.#requestRecovery()
  }

  pageShown(): void {
    this.#requestRecovery()
  }

  networkChanged(online: boolean): void {
    this.#online = online
    if (this.#state.type === "revoked") return
    if (online) {
      this.#requestRecovery()
      return
    }
    this.#recovery.cancelPending()
    this.#generation += 1
    this.#abort?.abort()
    this.#stream?.close()
    this.#abort = undefined
    this.#stream = undefined
    this.#setState(
      this.#snapshot === undefined
        ? { type: "offline" }
        : { type: "offline", snapshot: this.#snapshot },
    )
  }

  async #loadAndAttach(): Promise<void> {
    const generation = ++this.#generation
    this.#abort?.abort()
    this.#stream?.close()
    this.#stream = undefined
    const abort = new AbortController()
    this.#abort = abort
    if (this.#snapshot === undefined) this.#setState({ type: "loading" })
    try {
      const snapshot = await this.#options.load(abort.signal)
      if (generation !== this.#generation || abort.signal.aborted) return
      this.#snapshot = snapshot
      this.#setState({ type: "ready", snapshot })
      this.#stream = this.#options.openStream(
        snapshot,
        (frame) => {
          if (generation === this.#generation) this.#onFrame(frame)
        },
        () => {
          if (generation === this.#generation) this.#onClose()
        },
      )
    } catch {
      if (generation !== this.#generation || abort.signal.aborted) return
      this.#setState(
        this.#snapshot === undefined
          ? { type: "error" }
          : { type: "offline", snapshot: this.#snapshot },
      )
      this.#requestRecovery()
    }
  }

  stop(): void {
    this.#stopped = true
    this.#generation += 1
    this.#recovery.cancelPending()
    this.#abort?.abort()
    this.#stream?.close()
    this.#abort = undefined
    this.#stream = undefined
  }

  #onFrame(input: unknown): void {
    const parsed = EventStreamServerFrameSchema.safeParse(input)
    if (!parsed.success || this.#snapshot === undefined) {
      this.#requestRecovery()
      return
    }
    const frame = parsed.data
    if (frame.type === "ready") {
      this.#recovery.reset()
      return
    }
    if (frame.type === "resync" || frame.brokerEpoch !== this.#snapshot.brokerEpoch) {
      void this.refresh()
      return
    }
    const events = frame.type === "replay" ? frame.events : [frame]
    const revocation = events.find((event) => event.event.type === "session.revoked")
    if (revocation !== undefined) {
      this.#generation += 1
      this.#recovery.cancelPending()
      this.#abort?.abort()
      this.#abort = undefined
      const stream = this.#stream
      this.#stream = undefined
      this.#snapshot = undefined
      this.#setState({ type: "revoked" })
      stream?.close()
      return
    }
    for (const event of events) {
      if (event.sequence <= this.#snapshot.sequence) continue
      void this.refresh()
      return
    }
  }

  #onClose(): void {
    if (this.#state.type === "revoked") return
    this.#stream = undefined
    this.#setState(
      this.#snapshot === undefined
        ? { type: "offline" }
        : { type: "offline", snapshot: this.#snapshot },
    )
    this.#requestRecovery()
  }

  #requestRecovery(): void {
    if (this.#stopped || !this.#online || this.#state.type === "revoked") return
    const request = this.#recovery.request(() => void this.#loadAndAttach())
    if (request !== "scheduled") return
    this.#setState(
      this.#snapshot === undefined
        ? { type: "reconnecting" }
        : { type: "reconnecting", snapshot: this.#snapshot },
    )
  }

  #setState(state: SynchronizerState<T>): void {
    this.#state = state
    for (const listener of this.#listeners) listener(state)
  }
}

export function eventStreamUrl(): string {
  const url = new URL("/api/v1/events", window.location.href)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return url.toString()
}

export function openBrowserEventStream(
  scope: EventStreamScope,
  position: SnapshotPosition,
  onFrame: (frame: unknown) => void,
  onClose: () => void,
): StreamConnection {
  const socket = new WebSocket(eventStreamUrl())
  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({ type: "subscribe", version: PROTOCOL_VERSION, ...position, scope }),
    )
  })
  socket.addEventListener("message", (message) => {
    try {
      onFrame(JSON.parse(String(message.data)))
    } catch {
      onFrame(undefined)
    }
  })
  socket.addEventListener("close", onClose)
  socket.addEventListener("error", () => socket.close())
  return { close: () => socket.close() }
}
