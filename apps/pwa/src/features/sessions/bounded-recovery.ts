export type RecoveryTimer = {
  readonly cancel: () => void
}

export type RecoveryRuntime = {
  readonly random: () => number
  readonly schedule: (delayMs: number, run: () => void) => RecoveryTimer
}

const BASE_DELAY_MS = 250
const MAX_DELAY_MS = 4_000
const MAX_ATTEMPTS = 5
const JITTER_RATIO = 0.25

const defaultRecoveryRuntime: RecoveryRuntime = {
  random: Math.random,
  schedule(delayMs, run) {
    const timer = globalThis.setTimeout(run, delayMs)
    return { cancel: () => globalThis.clearTimeout(timer) }
  },
}

function recoveryDelay(attempt: number, random: number): number {
  const exponential = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
  return Math.min(Math.round(exponential * (1 + JITTER_RATIO * random)), MAX_DELAY_MS)
}

export class BoundedRecovery {
  readonly #runtime: RecoveryRuntime
  #attempts = 0
  #pending: RecoveryTimer | undefined

  constructor(runtime: RecoveryRuntime = defaultRecoveryRuntime) {
    this.#runtime = runtime
  }

  request(run: () => void): "coalesced" | "exhausted" | "scheduled" {
    if (this.#pending !== undefined) return "coalesced"
    if (this.#attempts >= MAX_ATTEMPTS) return "exhausted"

    const delayMs = recoveryDelay(this.#attempts, this.#runtime.random())
    const timer = this.#runtime.schedule(delayMs, () => {
      if (this.#pending !== timer) return
      this.#pending = undefined
      this.#attempts += 1
      run()
    })
    this.#pending = timer
    return "scheduled"
  }

  cancelPending(): void {
    this.#pending?.cancel()
    this.#pending = undefined
  }

  reset(): void {
    this.cancelPending()
    this.#attempts = 0
  }
}
