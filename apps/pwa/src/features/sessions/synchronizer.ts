import {
  type BrokerEpoch,
  type EventStreamScope,
  EventStreamServerFrameSchema,
  type MonotonicSequence,
  PROTOCOL_VERSION,
} from "@opencode-dispatch/contracts"

export type SnapshotPosition = {
  readonly brokerEpoch: BrokerEpoch
  readonly sequence: MonotonicSequence
}

export type SynchronizerState<T extends SnapshotPosition> =
  | { readonly type: "loading" }
  | { readonly type: "ready"; readonly snapshot: T }
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
}

export class SessionSynchronizer<T extends SnapshotPosition> {
  readonly #listeners = new Set<(state: SynchronizerState<T>) => void>()
  readonly #options: SessionSynchronizerOptions<T>
  #abort: AbortController | undefined
  #generation = 0
  #snapshot: T | undefined
  #state: SynchronizerState<T> = { type: "loading" }
  #stream: StreamConnection | undefined

  constructor(options: SessionSynchronizerOptions<T>) {
    this.#options = options
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
    void this.refresh()
  }

  async refresh(): Promise<void> {
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
    }
  }

  stop(): void {
    this.#generation += 1
    this.#abort?.abort()
    this.#stream?.close()
    this.#abort = undefined
    this.#stream = undefined
  }

  #onFrame(input: unknown): void {
    const parsed = EventStreamServerFrameSchema.safeParse(input)
    if (!parsed.success || this.#snapshot === undefined) {
      void this.refresh()
      return
    }
    const frame = parsed.data
    if (frame.type === "ready") return
    if (frame.type === "resync" || frame.brokerEpoch !== this.#snapshot.brokerEpoch) {
      void this.refresh()
      return
    }
    const events = frame.type === "replay" ? frame.events : [frame]
    for (const event of events) {
      if (event.event.type === "session.revoked") {
        this.#stream?.close()
        this.#stream = undefined
        this.#snapshot = undefined
        this.#setState({ type: "revoked" })
        return
      }
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
