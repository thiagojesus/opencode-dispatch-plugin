import { Toast, toaster } from "@kobalte/core/toast"
import { CheckCircle, Info, Warning, WarningCircle, X } from "phosphor-solid"
import type { JSX } from "solid-js"

import { ConfirmationDialog, ToastViewport } from "../ui/feedback"
import { ActionButton } from "./actions"

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
      <ToastViewport />
    </div>
  )
}
