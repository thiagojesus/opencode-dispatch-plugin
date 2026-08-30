import {
  AbortRequestSchema,
  assertNever,
  PROTOCOL_VERSION,
  type SessionId,
} from "@opencode-dispatch/contracts"
import { createEffect, createMemo, createSignal, type JSX, onCleanup } from "solid-js"

import { ConfirmationDialog } from "../../ui/feedback"
import { actionFailureFrom, isAbortError } from "./action-error"
import { ActionStatus } from "./action-status"
import type { ActionAvailability, ActionStatusState, RemoteActionClient } from "./types"

type AbortControlProps = {
  readonly availability: ActionAvailability
  readonly client: RemoteActionClient
  readonly sessionId: SessionId
}

type AbortPhase = "accepted" | "error" | "idle" | "offline" | "revoked" | "submitting"

function abortStatus(phase: AbortPhase, detail: string): ActionStatusState {
  switch (phase) {
    case "accepted":
      return { kind: phase, label: "Accepted", message: "Work aborted", tone: "success" }
    case "error":
      return { kind: phase, label: "Not aborted", message: detail, tone: "danger" }
    case "idle":
      return {
        kind: phase,
        label: "Active",
        message: "Abort requires confirmation and preserves completed local changes.",
        tone: "warning",
      }
    case "offline":
      return {
        kind: phase,
        label: "Offline",
        message: "Abort is unavailable until the trusted connection returns.",
        tone: "warning",
      }
    case "revoked":
      return {
        kind: phase,
        label: "Revoked",
        message: "Access revoked",
        tone: "danger",
      }
    case "submitting":
      return {
        kind: phase,
        label: "Aborting",
        message: "Waiting for the authoritative action response.",
        tone: "warning",
      }
    default:
      return assertNever(phase)
  }
}

export function AbortControl(props: AbortControlProps): JSX.Element {
  const [detail, setDetail] = createSignal("")
  const [phase, setPhase] = createSignal<AbortPhase>(
    props.availability === "active" ? "idle" : props.availability,
  )
  let controller: AbortController | undefined

  createEffect(() => {
    if (props.availability === "active") return
    controller?.abort()
    setPhase(props.availability)
  })

  onCleanup(() => controller?.abort())

  const status = createMemo(() => abortStatus(phase(), detail()))
  const abort = async (): Promise<void> => {
    if (props.availability !== "active" || phase() === "accepted" || phase() === "submitting") {
      return
    }
    const activeController = new AbortController()
    controller = activeController
    setPhase("submitting")
    try {
      const response = await props.client.executeAction(
        AbortRequestSchema.parse({
          type: "abort",
          version: PROTOCOL_VERSION,
          sessionId: props.sessionId,
        }),
        activeController.signal,
      )
      if (props.availability !== "active") return
      if (response.type !== "abort_accepted") {
        throw new TypeError(`Expected abort_accepted, received ${response.type}`)
      }
      setPhase("accepted")
    } catch (error) {
      if (props.availability !== "active" || isAbortError(error)) return
      const failure = actionFailureFrom(error, "Abort acceptance could not be confirmed.")
      setDetail(
        failure.code === "PENDING_ACTION_STALE"
          ? "The active work already changed. Refresh before trying again."
          : failure.message,
      )
      setPhase("error")
    } finally {
      if (controller === activeController) {
        controller = undefined
      }
    }
  }

  return (
    <section class="decision-card stack" data-testid="abort-control">
      <div class="decision-card__heading stack">
        <h3>Active work</h3>
        <p>Stop only the current operation. Completed local changes remain on disk.</p>
      </div>
      <ActionStatus state={status()} />
      <ConfirmationDialog
        confirmLabel="Confirm abort"
        disabled={
          props.availability !== "active" || phase() === "accepted" || phase() === "submitting"
        }
        kind="abort"
        onConfirm={() => {
          void abort()
        }}
        triggerLabel="Abort work"
      />
    </section>
  )
}
