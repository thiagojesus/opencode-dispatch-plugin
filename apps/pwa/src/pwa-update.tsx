import { ArrowClockwise, X } from "phosphor-solid"
import { createSignal, type JSX, onMount, Show } from "solid-js"

import { ActionButton } from "./ui/action-button"

type UpdateWorker = (reloadPage?: boolean) => Promise<void>

type RegisterWorkerOptions = {
  readonly immediate: boolean
  readonly onNeedRefresh: () => void
}

export type RegisterPwaWorker = (options: RegisterWorkerOptions) => UpdateWorker

type PwaUpdatePromptProps = {
  readonly registerWorker: RegisterPwaWorker
}

export function PwaUpdatePrompt(props: PwaUpdatePromptProps): JSX.Element {
  const [updateAvailable, setUpdateAvailable] = createSignal(false)
  let updateWorker: UpdateWorker | undefined

  const activateUpdate = (): void => {
    if (updateWorker === undefined) {
      return
    }
    setUpdateAvailable(false)
    void updateWorker(true)
  }

  onMount(() => {
    updateWorker = props.registerWorker({
      immediate: true,
      onNeedRefresh: () => {
        setUpdateAvailable(true)
      },
    })
  })

  return (
    <Show when={updateAvailable()}>
      <aside aria-label="Application update" class="toast-region" data-testid="pwa-update">
        <div class="toast-list">
          <div class="toast" data-kind="info">
            <span class="icon-well icon-well--small">
              <ArrowClockwise aria-hidden="true" size={20} weight="bold" />
            </span>
            <div class="toast__copy" role="status">
              <strong>Update available</strong>
              <span>Refresh to use the latest trusted application shell.</span>
            </div>
            <div class="cluster toast__actions">
              <ActionButton ariaLabel="Update now" onClick={activateUpdate} variant="primary">
                Update now
              </ActionButton>
              <ActionButton
                ariaLabel="Remind me later"
                iconOnly={true}
                onClick={() => {
                  setUpdateAvailable(false)
                }}
                variant="ghost"
              >
                <X aria-hidden="true" size={20} weight="bold" />
              </ActionButton>
            </div>
          </div>
        </div>
      </aside>
    </Show>
  )
}
