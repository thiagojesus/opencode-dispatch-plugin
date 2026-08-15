import type { BrokerEpoch } from "@opencode-dispatch/contracts"

import { CLUSTER_ERROR_CODES, ClusterError, type ClusterErrorCode } from "./errors.ts"
import {
  type ClusterServerFrame,
  ClusterServerFrameSchema,
  clusterWebSocketUrl,
} from "./protocol.ts"

type Waiter<T> = {
  readonly reject: (error: ClusterError) => void
  readonly resolve: (value: T) => void
  readonly timer: ReturnType<typeof setTimeout>
}

function isClusterErrorCode(value: string): value is ClusterErrorCode {
  return CLUSTER_ERROR_CODES.some((code) => code === value)
}

export class ClusterSocketChannel {
  readonly #brokerEpoch: BrokerEpoch
  readonly #frames: ClusterServerFrame[] = []
  readonly #frameWaiters: Waiter<ClusterServerFrame>[] = []
  readonly #onClose: () => void
  readonly #requestWaiters = new Map<string, Waiter<void>>()
  readonly #socket: WebSocket
  readonly #timeoutMs: number
  #intentionalClose = false

  private constructor(brokerEpoch: BrokerEpoch, onClose: () => void, timeoutMs: number) {
    this.#brokerEpoch = brokerEpoch
    this.#onClose = onClose
    this.#timeoutMs = timeoutMs
    this.#socket = new WebSocket(clusterWebSocketUrl())
    this.#socket.addEventListener("message", (event) => this.#message(event))
    this.#socket.addEventListener("close", () => this.#closed())
    this.#socket.addEventListener("error", () =>
      this.#fail(new ClusterError("protocol_incompatible")),
    )
  }

  static async open(
    brokerEpoch: BrokerEpoch,
    onClose: () => void,
    timeoutMs: number,
  ): Promise<ClusterSocketChannel> {
    const channel = new ClusterSocketChannel(brokerEpoch, onClose, timeoutMs)
    await channel.#opened()
    return channel
  }

  nextFrame(): Promise<ClusterServerFrame> {
    const frame = this.#frames.shift()
    if (frame !== undefined) {
      return Promise.resolve(frame)
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new ClusterError("protocol_incompatible")),
        this.#timeoutMs,
      )
      this.#frameWaiters.push({ reject, resolve, timer })
    })
  }

  request(requestId: string, frame: object): Promise<void> {
    const acknowledged = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#requestWaiters.delete(requestId)
        reject(new ClusterError("protocol_incompatible"))
      }, this.#timeoutMs)
      this.#requestWaiters.set(requestId, { reject, resolve, timer })
    })
    this.send(frame)
    return acknowledged
  }

  send(frame: object): void {
    if (this.#socket.readyState !== WebSocket.OPEN) {
      throw new ClusterError("protocol_incompatible")
    }
    this.#socket.send(JSON.stringify(frame))
  }

  close(): void {
    this.#intentionalClose = true
    this.#socket.close()
    this.#fail(new ClusterError("protocol_incompatible"))
  }

  async #opened(): Promise<void> {
    if (this.#socket.readyState === WebSocket.OPEN) {
      return
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new ClusterError("protocol_incompatible")),
        this.#timeoutMs,
      )
      this.#socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
      this.#socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer)
          reject(new ClusterError("protocol_incompatible"))
        },
        { once: true },
      )
    })
  }

  #message(event: MessageEvent): void {
    let value: unknown
    try {
      value = JSON.parse(String(event.data))
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.#fail(new ClusterError("protocol_incompatible"))
        return
      }
      throw error
    }
    const parsed = ClusterServerFrameSchema.safeParse(value)
    if (!parsed.success || parsed.data.brokerEpoch !== this.#brokerEpoch) {
      this.#fail(new ClusterError("protocol_incompatible"))
      return
    }
    const frameWaiter = this.#frameWaiters.shift()
    if (frameWaiter !== undefined) {
      clearTimeout(frameWaiter.timer)
      frameWaiter.resolve(parsed.data)
      return
    }
    if (parsed.data.type === "acknowledged") {
      const request = this.#requestWaiters.get(parsed.data.requestId)
      if (request !== undefined) {
        clearTimeout(request.timer)
        this.#requestWaiters.delete(parsed.data.requestId)
        request.resolve()
      }
      return
    }
    if (parsed.data.type === "error") {
      const failure = new ClusterError(
        isClusterErrorCode(parsed.data.code) ? parsed.data.code : "protocol_incompatible",
      )
      if (parsed.data.requestId !== undefined) {
        const request = this.#requestWaiters.get(parsed.data.requestId)
        if (request !== undefined) {
          clearTimeout(request.timer)
          this.#requestWaiters.delete(parsed.data.requestId)
          request.reject(failure)
          return
        }
      }
      this.#fail(failure)
      return
    }
    this.#frames.push(parsed.data)
  }

  #closed(): void {
    this.#fail(new ClusterError("protocol_incompatible"))
    if (!this.#intentionalClose) {
      this.#onClose()
    }
  }

  #fail(error: ClusterError): void {
    for (const waiter of this.#frameWaiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    for (const waiter of this.#requestWaiters.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    this.#requestWaiters.clear()
  }
}
