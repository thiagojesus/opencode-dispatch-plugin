import { A, useLocation } from "@solidjs/router"
import { DeviceMobile, List } from "phosphor-solid"
import { createSignal, type JSX, onCleanup, onMount, type ParentProps } from "solid-js"

import { type ContinuityKind, ContinuityRail } from "../ui/continuity"
import { ToastViewport } from "../ui/feedback"
import { type ProductContinuityChannel, ProductContinuityContext } from "./continuity-state"
import { ThemePreferenceButton } from "./theme-control"

function continuityForPath(pathname: string): ContinuityKind {
  if (pathname === "/offline") {
    return "offline"
  }
  if (pathname === "/revoked") {
    return "revoked"
  }
  if (pathname.startsWith("/sessions/")) {
    return "reconnecting"
  }
  return "enabled"
}

export function ProductShell(props: ParentProps): JSX.Element {
  const location = useLocation()
  const [online, setOnline] = createSignal(navigator.onLine)
  const [runtimeContinuity, setRuntimeContinuity] = createSignal<
    { readonly kind: ContinuityKind; readonly source: symbol } | undefined
  >()
  let dockRegion: HTMLElement | undefined
  let headerRegion: HTMLElement | undefined
  let mainRegion: HTMLElement | undefined
  let shellRegion: HTMLElement | undefined
  let shellResizeObserver: ResizeObserver | undefined

  const continuity = (): ContinuityKind => {
    if (!online()) return "offline"
    return runtimeContinuity()?.kind ?? continuityForPath(location.pathname)
  }
  const continuityChannel: ProductContinuityChannel = {
    clear: (source) => {
      setRuntimeContinuity((current) => (current?.source === source ? undefined : current))
    },
    publish: (source, kind) => {
      setRuntimeContinuity({ kind, source })
    },
  }
  const markOnline = (): void => {
    setOnline(true)
  }
  const markOffline = (): void => {
    setOnline(false)
  }
  const syncShellReflow = (): void => {
    if (
      dockRegion === undefined ||
      headerRegion === undefined ||
      mainRegion === undefined ||
      shellRegion === undefined
    ) {
      return
    }

    const continuityRegion = shellRegion.querySelector('[data-testid="product-continuity"]')
    if (!(continuityRegion instanceof HTMLElement)) {
      return
    }

    const viewportBlockSize = window.visualViewport?.height ?? window.innerHeight
    const renderedScale = shellRegion.getBoundingClientRect().height / shellRegion.offsetHeight
    const fixedBlockSize =
      headerRegion.getBoundingClientRect().height +
      continuityRegion.getBoundingClientRect().height +
      dockRegion.getBoundingClientRect().height
    const needsReflow = renderedScale > 1.01 || fixedBlockSize >= viewportBlockSize

    if (needsReflow) {
      shellRegion.style.setProperty(
        "--product-shell-reflow-block-size",
        `${viewportBlockSize / renderedScale}px`,
      )
      shellRegion.setAttribute("data-reflow", "true")
      shellRegion.setAttribute("data-scroll-owner", "true")
      mainRegion.removeAttribute("data-scroll-owner")
      return
    }

    shellRegion.style.removeProperty("--product-shell-reflow-block-size")
    shellRegion.removeAttribute("data-reflow")
    shellRegion.removeAttribute("data-scroll-owner")
    mainRegion.setAttribute("data-scroll-owner", "true")
  }

  onMount(() => {
    document.body.setAttribute("data-surface", "product")
    document.title = "OpenCode Dispatch"
    window.addEventListener("online", markOnline)
    window.addEventListener("offline", markOffline)
    window.addEventListener("resize", syncShellReflow)
    window.visualViewport?.addEventListener("resize", syncShellReflow)
    shellResizeObserver = new ResizeObserver(syncShellReflow)
    for (const region of [dockRegion, headerRegion, mainRegion, shellRegion]) {
      if (region !== undefined) {
        shellResizeObserver.observe(region)
      }
    }
    syncShellReflow()
  })

  onCleanup(() => {
    document.body.removeAttribute("data-surface")
    window.removeEventListener("online", markOnline)
    window.removeEventListener("offline", markOffline)
    window.removeEventListener("resize", syncShellReflow)
    window.visualViewport?.removeEventListener("resize", syncShellReflow)
    shellResizeObserver?.disconnect()
  })

  return (
    <ProductContinuityContext.Provider value={continuityChannel}>
      <div
        class="product-shell"
        data-testid="product-shell"
        ref={(element) => {
          shellRegion = element
        }}
      >
        <button
          class="skip-link"
          data-testid="product-skip-link"
          onClick={() => mainRegion?.focus()}
          type="button"
        >
          Skip to session workspace
        </button>
        <header
          class="product-shell__header"
          ref={(element) => {
            headerRegion = element
          }}
        >
          <A class="product-brand" href="/sessions">
            <span class="icon-well icon-well--small">
              <DeviceMobile aria-hidden="true" size={20} weight="bold" />
            </span>
            <span class="product-brand__copy">
              <strong>OpenCode Dispatch</strong>
              <span>Trusted mobile continuation</span>
            </span>
          </A>
          <nav aria-label="Primary" class="product-nav">
            <A class="product-nav__link" end={true} href="/sessions">
              <List aria-hidden="true" size={20} weight="bold" />
              Sessions
            </A>
          </nav>
          <ThemePreferenceButton />
        </header>
        <ContinuityRail kind={continuity()} testId="product-continuity" />
        <main
          class="product-shell__body shell-body"
          data-scroll-owner="true"
          data-testid="shell-scroll-owner"
          ref={(element) => {
            mainRegion = element
          }}
          tabindex="-1"
        >
          {props.children}
        </main>
        <footer
          class="product-shell__dock cluster"
          ref={(element) => {
            dockRegion = element
          }}
        >
          <span>Remote actions appear only after a fresh authoritative snapshot.</span>
        </footer>
        <ToastViewport />
      </div>
    </ProductContinuityContext.Provider>
  )
}
