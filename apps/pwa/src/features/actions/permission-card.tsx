import {
  assertNever,
  type PermissionDecision,
  PermissionReplyRequestSchema,
  type PermissionRequest,
  PROTOCOL_VERSION,
  type SessionId,
} from "@opencode-dispatch/contracts"
import { LockKey } from "phosphor-solid"
import { createEffect, createMemo, createSignal, For, type JSX, onCleanup, Show } from "solid-js"

import { ActionButton } from "../../ui/action-button"
import { ConfirmationDialog } from "../../ui/feedback"
import { actionFailureFrom, isAbortError } from "./action-error"
import { ActionStatus } from "./action-status"
import type { ActionAvailability, ActionStatusState, RemoteActionClient } from "./types"

type PermissionCardProps = {
  readonly availability: ActionAvailability
  readonly client: RemoteActionClient
  readonly request: PermissionRequest
  readonly sessionId: SessionId
  readonly workActive: boolean
}

type PermissionPhase = "accepted" | "error" | "idle" | "offline" | "revoked" | "submitting"

function permissionStatus(
  phase: PermissionPhase,
  detail: string,
  decision: PermissionDecision | undefined,
): ActionStatusState {
  switch (phase) {
    case "accepted":
      return decision === "once"
        ? {
            kind: phase,
            label: "Allowed once",
            message: "Permission allowed once",
            tone: "success",
          }
        : {
            kind: phase,
            label: "Rejected",
            message: "Permission rejected",
            tone: "success",
          }
    case "error":
      return { kind: phase, label: "Still pending", message: detail, tone: "danger" }
    case "idle":
      return {
        kind: phase,
        label: "Pending",
        message: "Choose one bounded decision for this request.",
        tone: "warning",
      }
    case "offline":
      return {
        kind: phase,
        label: "Offline",
        message: "The permission remains pending until the trusted connection returns.",
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
        label: "Submitting",
        message: "Waiting for the authoritative permission response.",
        tone: "warning",
      }
    default:
      return assertNever(phase)
  }
}

export function PermissionCard(props: PermissionCardProps): JSX.Element {
  const [decision, setDecision] = createSignal<PermissionDecision>()
  const [detail, setDetail] = createSignal("")
  const [phase, setPhase] = createSignal<PermissionPhase>(
    props.availability === "active" ? "idle" : props.availability,
  )
  let controller: AbortController | undefined

  createEffect(() => {
    if (props.availability === "active") return
    controller?.abort()
    setPhase(props.availability)
  })

  onCleanup(() => controller?.abort())

  const status = createMemo(() => permissionStatus(phase(), detail(), decision()))
  const busy = (): boolean => phase() === "submitting"
  const disabled = (): boolean =>
    props.availability !== "active" || busy() || phase() === "accepted"

  const submit = async (nextDecision: PermissionDecision): Promise<void> => {
    if (disabled()) return
    const activeController = new AbortController()
    controller = activeController
    setPhase("submitting")
    try {
      const response = await props.client.executeAction(
        PermissionReplyRequestSchema.parse({
          type: "permission_reply",
          version: PROTOCOL_VERSION,
          sessionId: props.sessionId,
          requestId: props.request.id,
          decision: nextDecision,
        }),
        activeController.signal,
      )
      if (props.availability !== "active") return
      if (
        response.type !== "permission_reply_accepted" ||
        response.decision !== nextDecision ||
        response.requestId !== props.request.id
      ) {
        throw new TypeError("Permission response did not match the pending request")
      }
      setDecision(nextDecision)
      setPhase("accepted")
    } catch (error) {
      if (props.availability !== "active" || isAbortError(error)) return
      const failure = actionFailureFrom(
        error,
        "Permission acceptance could not be confirmed. Refresh the pending request.",
      )
      setDetail(failure.message)
      setPhase("error")
    } finally {
      if (controller === activeController) {
        controller = undefined
      }
    }
  }

  return (
    <article class="decision-card stack" data-testid="permission-card">
      <div class="decision-card__heading cluster">
        <span class="icon-well">
          <LockKey aria-hidden="true" size={24} weight="bold" />
        </span>
        <div class="stack">
          <h3>Permission requested</h3>
          <p>Review the exact capability and every affected resource before deciding.</p>
        </div>
      </div>
      <dl class="scope-list">
        <div>
          <dt>Action</dt>
          <dd>
            <code>{props.request.action}</code>
          </dd>
        </div>
        <div>
          <dt>Resources</dt>
          <dd>
            <ul class="permission-resource-list">
              <For each={props.request.resources}>
                {(resource) => (
                  <li>
                    <code>{resource}</code>
                  </li>
                )}
              </For>
            </ul>
          </dd>
        </div>
        <Show when={props.request.source}>
          {(source) => (
            <div>
              <dt>Request source</dt>
              <dd>
                <code>
                  {source().messageId} / {source().callId}
                </code>
              </dd>
            </div>
          )}
        </Show>
      </dl>
      <ActionStatus state={status()} />
      <Show when={phase() !== "accepted"}>
        <div class="cluster decision-card__footer">
          <ActionButton
            busy={busy() && decision() === "once"}
            disabled={disabled()}
            onClick={() => {
              setDecision("once")
              void submit("once")
            }}
            variant="primary"
          >
            Allow once
          </ActionButton>
          <Show
            fallback={
              <ActionButton
                disabled={disabled()}
                onClick={() => {
                  setDecision("reject")
                  void submit("reject")
                }}
                variant="danger"
              >
                Reject
              </ActionButton>
            }
            when={props.workActive}
          >
            <ConfirmationDialog
              disabled={disabled()}
              kind="reject"
              onConfirm={() => {
                setDecision("reject")
                void submit("reject")
              }}
              triggerLabel="Reject"
            />
          </Show>
        </div>
      </Show>
    </article>
  )
}
