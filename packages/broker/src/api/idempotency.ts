type IdempotencyEntry<T> = {
  readonly createdAt: number
  readonly promise: Promise<T>
  settled: boolean
}

type IdempotencyCacheOptions = {
  readonly maxEntries: number
  readonly now: () => number
  readonly ttlMs: number
}

export type IdempotencyResult<T> = {
  readonly duplicate: boolean
  readonly value: T
}

export class IdempotencyCapacityError extends Error {
  override readonly name = "IdempotencyCapacityError"
}

export class BoundedIdempotencyCache<T> {
  readonly #entries = new Map<string, IdempotencyEntry<T>>()
  readonly #options: IdempotencyCacheOptions

  constructor(options: IdempotencyCacheOptions) {
    if (
      !Number.isSafeInteger(options.maxEntries) ||
      options.maxEntries <= 0 ||
      !Number.isSafeInteger(options.ttlMs) ||
      options.ttlMs <= 0
    ) {
      throw new IdempotencyCapacityError()
    }
    this.#options = options
  }

  async run(key: string, operation: () => Promise<T>): Promise<IdempotencyResult<T>> {
    const now = this.#options.now()
    if (!Number.isSafeInteger(now) || now < 0 || key.length === 0 || key.length > 1_024) {
      throw new IdempotencyCapacityError()
    }
    this.#prune(now)
    const existing = this.#entries.get(key)
    if (existing !== undefined) {
      return { duplicate: true, value: await existing.promise }
    }
    this.#makeRoom()
    let entry: IdempotencyEntry<T>
    const promise = operation().finally(() => {
      entry.settled = true
    })
    entry = { createdAt: now, promise, settled: false }
    this.#entries.set(key, entry)
    return { duplicate: false, value: await promise }
  }

  #makeRoom(): void {
    if (this.#entries.size < this.#options.maxEntries) return
    for (const [key, entry] of this.#entries) {
      if (entry.settled) {
        this.#entries.delete(key)
        return
      }
    }
    throw new IdempotencyCapacityError()
  }

  #prune(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (entry.settled && entry.createdAt + this.#options.ttlMs <= now) {
        this.#entries.delete(key)
      }
    }
  }
}
