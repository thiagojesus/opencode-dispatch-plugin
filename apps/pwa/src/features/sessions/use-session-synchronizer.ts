import type { SessionListResponse, SessionSnapshot } from "@opencode-dispatch/contracts"
import { type Accessor, createEffect, createSignal, onCleanup, onMount } from "solid-js"

import { useProductContinuity } from "../../product/continuity-state"
import type { ContinuityKind } from "../../ui/continuity"
import type { SessionSynchronizer, SynchronizerState } from "./synchronizer"

function continuityKind<T extends SessionListResponse | SessionSnapshot>(
  state: SynchronizerState<T>,
): ContinuityKind {
  switch (state.type) {
    case "ready":
      return "connected"
    case "offline":
      return "offline"
    case "revoked":
      return "revoked"
    case "error":
    case "loading":
    case "reconnecting":
      return "reconnecting"
  }
}

export function useSessionSynchronizer<T extends SessionListResponse | SessionSnapshot>(
  synchronizer: SessionSynchronizer<T>,
): Accessor<SynchronizerState<T>> {
  const continuity = useProductContinuity()
  const continuitySource = Symbol("session-continuity")
  const [state, setState] = createSignal<SynchronizerState<T>>(synchronizer.state)
  const visibilityChanged = (): void =>
    synchronizer.visibilityChanged(document.visibilityState === "visible")
  const pageShown = (): void => synchronizer.pageShown()
  const networkOnline = (): void => synchronizer.networkChanged(true)
  const networkOffline = (): void => synchronizer.networkChanged(false)
  createEffect(() => continuity.publish(continuitySource, continuityKind(state())))
  onMount(() => {
    const unsubscribe = synchronizer.subscribe(setState)
    synchronizer.start()
    document.addEventListener("visibilitychange", visibilityChanged)
    window.addEventListener("pageshow", pageShown)
    window.addEventListener("online", networkOnline)
    window.addEventListener("offline", networkOffline)
    onCleanup(() => {
      document.removeEventListener("visibilitychange", visibilityChanged)
      window.removeEventListener("pageshow", pageShown)
      window.removeEventListener("online", networkOnline)
      window.removeEventListener("offline", networkOffline)
      continuity.clear(continuitySource)
      unsubscribe()
      synchronizer.stop()
    })
  })
  return state
}
