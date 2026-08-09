import { AlertDialog } from "@kobalte/core/alert-dialog"
import { Toast, toaster } from "@kobalte/core/toast"
import { CheckCircle, Info, Warning, WarningCircle, X } from "phosphor-solid"
import type { JSX } from "solid-js"

import { ActionButton } from "./actions"

type ConfirmationKind = "abort" | "revoke"

type ConfirmationDialogProps = {
  readonly kind: ConfirmationKind
}

const CONFIRMATION_COPY = {
  abort: {
    confirm: "Abort work",
    description:
      "The local agent will stop its current operation. Completed local changes remain on disk.",
    safe: "Keep running",
    title: "Abort active work?",
    trigger: "Open abort confirmation",
  },
  revoke: {
    confirm: "Revoke access",
    description:
      "This device will lose remote access immediately. The local session keeps running on the desktop.",
    safe: "Keep access",
    title: "Revoke remote access?",
    trigger: "Open revoke confirmation",
  },
} as const satisfies Record<
  ConfirmationKind,
  {
    readonly confirm: string
    readonly description: string
    readonly safe: string
    readonly title: string
    readonly trigger: string
  }
>

function showSavedToast(): void {
  toaster.show((props) => (
    <Toast class="toast" toastId={props.toastId}>
      <span class="icon-well icon-well--small">
        <CheckCircle aria-hidden="true" size={20} weight="bold" />
      </span>
      <div class="toast__copy">
        <Toast.Title>Saved</Toast.Title>
        <Toast.Description>The local draft remains available on this device.</Toast.Description>
      </div>
      <Toast.CloseButton aria-label="Dismiss saved notification" class="action action--icon">
        <X aria-hidden="true" size={20} weight="bold" />
      </Toast.CloseButton>
    </Toast>
  ))
}

export function ConfirmationDialog(props: ConfirmationDialogProps): JSX.Element {
  let safeAction: HTMLButtonElement | undefined
  const copy = CONFIRMATION_COPY[props.kind]

  const focusSafeAction = (event: Event): void => {
    event.preventDefault()
    safeAction?.focus()
  }

  return (
    <AlertDialog>
      <AlertDialog.Trigger class="action action--danger">{copy.trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay class="dialog-overlay" />
        <div class="dialog-positioner">
          <AlertDialog.Content class="dialog-content stack" onOpenAutoFocus={focusSafeAction}>
            <AlertDialog.Title>{copy.title}</AlertDialog.Title>
            <AlertDialog.Description>{copy.description}</AlertDialog.Description>
            <div class="cluster dialog-actions">
              <AlertDialog.CloseButton
                aria-label={copy.safe}
                class="action action--secondary"
                ref={(element) => {
                  safeAction = element
                }}
              >
                {copy.safe}
              </AlertDialog.CloseButton>
              <AlertDialog.CloseButton aria-label={copy.confirm} class="action action--danger">
                {copy.confirm}
              </AlertDialog.CloseButton>
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog>
  )
}

export function FeedbackShowcase(): JSX.Element {
  return (
    <div class="primitive-card stack">
      <h3>Confirmation and transient feedback</h3>
      <p>
        Destructive work requires explicit context. Routine saved feedback stays polite and keeps
        focus where the action began.
      </p>
      <div class="cluster">
        <ConfirmationDialog kind="abort" />
        <ConfirmationDialog kind="revoke" />
        <ActionButton onClick={showSavedToast}>Show saved toast</ActionButton>
      </div>
      <section class="stack" aria-label="Toast variants">
        <div class="toast" data-kind="info" data-showcase-variant="toast-info" role="status">
          <span class="icon-well icon-well--small">
            <Info aria-hidden="true" size={20} weight="bold" />
          </span>
          <div class="toast__copy">
            <strong>Snapshot available</strong>
            <span>Review the latest local state before acting.</span>
          </div>
        </div>
        <div class="toast" data-kind="success" data-showcase-variant="toast-success" role="status">
          <span class="icon-well icon-well--small">
            <CheckCircle aria-hidden="true" size={20} weight="bold" />
          </span>
          <div class="toast__copy">
            <strong>Saved</strong>
            <span>The local draft remains available on this device.</span>
          </div>
        </div>
        <div class="toast" data-kind="warning" data-showcase-variant="toast-warning" role="status">
          <span class="icon-well icon-well--small">
            <Warning aria-hidden="true" size={20} weight="bold" />
          </span>
          <div class="toast__copy">
            <strong>Connection unstable</strong>
            <span>Wait for a fresh snapshot before sending another action.</span>
          </div>
        </div>
        <div class="toast" data-kind="error" data-showcase-variant="toast-error" role="alert">
          <span class="icon-well icon-well--small">
            <WarningCircle aria-hidden="true" size={20} weight="bold" />
          </span>
          <div class="toast__copy">
            <strong>Send failed</strong>
            <span>The draft is preserved. Retry when the trusted link returns.</span>
          </div>
        </div>
      </section>
      <Toast.Region aria-label="Notifications" class="toast-region" data-testid="toast-region">
        <Toast.List class="toast-list" />
      </Toast.Region>
    </div>
  )
}
