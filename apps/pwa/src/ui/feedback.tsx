import { AlertDialog } from "@kobalte/core/alert-dialog"
import { Toast } from "@kobalte/core/toast"
import type { JSX } from "solid-js"
import { Portal } from "solid-js/web"

export type ConfirmationKind = "abort" | "reject" | "revoke"

type ConfirmationDialogProps = {
  readonly confirmLabel?: string
  readonly disabled?: boolean
  readonly kind: ConfirmationKind
  readonly onConfirm?: (() => void) | undefined
  readonly triggerLabel?: string
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
  reject: {
    confirm: "Reject request",
    description:
      "The local agent will receive a one-time rejection for this pending request. Active work may stop waiting for this decision.",
    safe: "Keep permission pending",
    title: "Reject active permission?",
    trigger: "Reject",
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

export function ConfirmationDialog(props: ConfirmationDialogProps): JSX.Element {
  let safeAction: HTMLButtonElement | undefined
  const copy = CONFIRMATION_COPY[props.kind]

  const focusSafeAction = (event: Event): void => {
    event.preventDefault()
    safeAction?.focus()
  }

  return (
    <AlertDialog>
      <AlertDialog.Trigger class="action action--danger" disabled={props.disabled === true}>
        {props.triggerLabel ?? copy.trigger}
      </AlertDialog.Trigger>
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
              <AlertDialog.CloseButton
                aria-label={props.confirmLabel ?? copy.confirm}
                class="action action--danger"
                {...(props.onConfirm === undefined ? {} : { onClick: props.onConfirm })}
              >
                {props.confirmLabel ?? copy.confirm}
              </AlertDialog.CloseButton>
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog>
  )
}

export function ToastViewport(): JSX.Element {
  return (
    <Portal>
      <Toast.Region
        aria-label="Notifications"
        class="toast-region"
        data-testid="toast-region"
        pauseOnInteraction={true}
        pauseOnPageIdle={true}
      >
        <Toast.List class="toast-list" />
      </Toast.Region>
    </Portal>
  )
}
