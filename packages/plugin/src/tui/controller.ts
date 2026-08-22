import {
  controlErrorMessage,
  currentSessionId,
  diagnosticsMessage,
  menuSummary,
  remoteUrl,
  statusMessage,
  tailscaleMessage,
} from "./presentation.ts"
import type {
  DispatchMenuOption,
  DispatchSnapshot,
  DispatchTuiDependencies,
  DispatchTuiHost,
} from "./types.ts"

export async function initializeDispatchTui(
  host: DispatchTuiHost,
  dependencies: DispatchTuiDependencies,
): Promise<() => Promise<void>> {
  let latest: DispatchSnapshot | undefined
  let disposed = false

  const refresh = async (reportFailure: boolean): Promise<DispatchSnapshot | undefined> => {
    try {
      latest = await dependencies.control.snapshot()
      return latest
    } catch (error) {
      const failure = error instanceof Error ? error : undefined
      if (reportFailure) {
        host.showAlert({ title: "Dispatch unavailable", message: controlErrorMessage(failure) })
      }
      return undefined
    }
  }

  const showStatus = (): void => {
    if (latest === undefined) return
    host.showAlert({ title: "Remote status", message: statusMessage(latest) })
  }
  const showTailscale = (): void => {
    if (latest === undefined) return
    host.showAlert({ title: "Tailscale setup", message: tailscaleMessage(latest.tailscale) })
  }
  const showDiagnostics = (): void => {
    if (latest === undefined) return
    host.showAlert({ title: "Privacy-safe diagnostics", message: diagnosticsMessage(latest) })
  }
  const requireRemoteUrl = (sessionId: string | undefined): string | undefined => {
    if (latest === undefined) return undefined
    const url = remoteUrl(latest, sessionId)
    if (url !== undefined) return url
    const message =
      sessionId !== undefined && latest.tailscale.kind === "ready"
        ? "Enable this session first. A session QR exists only while its live process exposure exists."
        : tailscaleMessage(latest.tailscale)
    host.showAlert({ title: "Remote link unavailable", message })
    return undefined
  }
  const showQr = (sessionId: string | undefined): void => {
    const url = requireRemoteUrl(sessionId)
    if (url === undefined) return
    host.showAlert({ title: "Remote QR", message: `${dependencies.renderQr(url)}\n\n${url}` })
  }
  const copyUrl = async (sessionId: string | undefined): Promise<void> => {
    const url = requireRemoteUrl(sessionId)
    if (url === undefined) return
    try {
      await dependencies.copyText(url)
      host.toast({
        title: "Remote link copied",
        message: "The credential-free HTTPS link is on the clipboard.",
      })
    } catch (error) {
      const failure = error instanceof Error ? error : undefined
      host.showAlert({ title: "Copy unavailable", message: controlErrorMessage(failure) })
    }
  }

  const mutate = async (action: "enable" | "disable", sessionId: string): Promise<void> => {
    if (latest === undefined) return
    const session = latest.sessions.find((item) => item.id === sessionId)
    if (session === undefined) {
      host.showAlert({
        title: "Session unavailable",
        message: controlErrorMessage({ code: "session_missing" }),
      })
      return
    }
    const alreadyApplied = action === "enable" ? session.enabled : !session.enabled
    if (alreadyApplied) {
      host.toast({
        title: "No change needed",
        message: `This session is already ${action === "enable" ? "enabled" : "disabled"}.`,
      })
      return
    }
    host.showConfirm({
      title: action === "enable" ? "Enable remote access?" : "Disable remote access?",
      message:
        action === "enable"
          ? "Only this current live session will be exposed through the private Tailscale route."
          : "Remote access to this session will stop immediately.",
      onConfirm: async () => {
        try {
          latest =
            action === "enable"
              ? await dependencies.control.enable({
                  sessionId,
                  title: host.sessionTitle(sessionId) ?? "Current session",
                })
              : await dependencies.control.disable(sessionId)
          host.toast({
            title: action === "enable" ? "Session enabled" : "Session disabled",
            message:
              action === "enable"
                ? "Private remote access is available while this process remains live."
                : "Remote access is no longer available.",
          })
        } catch (error) {
          const failure = error instanceof Error ? error : undefined
          host.showAlert({ title: "Dispatch action failed", message: controlErrorMessage(failure) })
        }
      },
    })
  }

  const open = async (): Promise<void> => {
    const snapshot = await refresh(true)
    if (snapshot === undefined) return
    const sessionId = currentSessionId(host.currentRoute())
    const session =
      sessionId === undefined ? undefined : snapshot.sessions.find((item) => item.id === sessionId)
    const sessionActions: readonly DispatchMenuOption[] =
      sessionId === undefined
        ? []
        : [
            {
              id: "enable",
              title: "Enable current session",
              description: "Confirm private remote access for this live process.",
              disabled: session === undefined || !session.live,
              onSelect: () => mutate("enable", sessionId),
            },
            {
              id: "disable",
              title: "Disable current session",
              description: "Confirm immediate revocation of this session route.",
              disabled: session === undefined || !session.enabled,
              onSelect: () => mutate("disable", sessionId),
            },
          ]
    host.showMenu({
      title: "Dispatch",
      summary: menuSummary(snapshot, sessionId),
      options: [
        ...sessionActions,
        {
          id: "status",
          title: "Remote status",
          description: "Show broker epoch and exposure counts.",
          onSelect: showStatus,
        },
        {
          id: "tailscale",
          title: "Tailscale setup",
          description: "Show manual private-transport requirements.",
          onSelect: showTailscale,
        },
        {
          id: "qr",
          title: "Show QR",
          description: "Render a credential-free HTTPS route.",
          onSelect: () => showQr(sessionId),
        },
        {
          id: "copy",
          title: "Copy URL",
          description: "Copy the credential-free HTTPS route.",
          onSelect: () => copyUrl(sessionId),
        },
        {
          id: "diagnostics",
          title: "Diagnostics",
          description: "Show bounded privacy-safe state codes.",
          onSelect: showDiagnostics,
        },
      ],
    })
  }

  const unregisterCommand = host.registerCommand({
    name: "dispatch.open",
    title: "Dispatch",
    category: "Plugin",
    namespace: "palette",
    slashName: "dispatch",
    run: open,
  })
  const unsubscribeControl = dependencies.control.subscribe((snapshot) => {
    latest = snapshot
  })
  const unsubscribeSessionStatus = host.subscribeSessionStatus(() => {
    void refresh(false)
  })

  return async () => {
    if (disposed) return
    disposed = true
    unsubscribeSessionStatus()
    unsubscribeControl()
    unregisterCommand()
    await dependencies.control.dispose()
  }
}
