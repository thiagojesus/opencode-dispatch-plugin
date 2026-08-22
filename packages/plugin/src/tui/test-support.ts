export type TestRoute =
  | { readonly name: "home" }
  | { readonly name: "session"; readonly params: { readonly sessionID: string } }
  | { readonly name: string; readonly params?: Readonly<Record<string, unknown>> }

export type TestCommand = {
  readonly name: string
  readonly title: string
  readonly category: string
  readonly namespace: string
  readonly slashName: string
  readonly run: () => void | Promise<void>
}

export type TestMenuOption = {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly disabled?: boolean
  readonly onSelect: () => void | Promise<void>
}

export type TestMenu = {
  readonly title: string
  readonly summary: string
  readonly options: readonly TestMenuOption[]
}

export type TestConfirm = {
  readonly title: string
  readonly message: string
  readonly onConfirm: () => void | Promise<void>
}

export type TestAlert = {
  readonly title: string
  readonly message: string
}

export class FakeTuiHost {
  route: TestRoute = { name: "home" }
  readonly commands: TestCommand[] = []
  readonly menus: TestMenu[] = []
  readonly confirms: TestConfirm[] = []
  readonly alerts: TestAlert[] = []
  readonly toasts: TestAlert[] = []
  readonly #sessionStatusListeners = new Set<() => void>()
  commandDisposals = 0
  statusDisposals = 0

  registerCommand(command: TestCommand): () => void {
    this.commands.push(command)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.commandDisposals += 1
    }
  }

  currentRoute(): TestRoute {
    return this.route
  }

  sessionTitle(sessionId: string): string | undefined {
    return sessionId === "ses-current" ? "Current session" : undefined
  }

  showMenu(menu: TestMenu): void {
    this.menus.push(menu)
  }

  showConfirm(confirm: TestConfirm): void {
    this.confirms.push(confirm)
  }

  showAlert(alert: TestAlert): void {
    this.alerts.push(alert)
  }

  toast(toast: TestAlert): void {
    this.toasts.push(toast)
  }

  subscribeSessionStatus(listener: () => void): () => void {
    this.#sessionStatusListeners.add(listener)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.#sessionStatusListeners.delete(listener)
      this.statusDisposals += 1
    }
  }

  emitSessionStatus(): void {
    for (const listener of this.#sessionStatusListeners) listener()
  }
}

export type TestSnapshot = {
  readonly brokerEpoch?: string
  readonly connected: boolean
  readonly sessions: readonly {
    readonly id: string
    readonly title: string
    readonly live: boolean
    readonly enabled: boolean
  }[]
  readonly tailscale:
    | { readonly kind: "ready"; readonly stableUrl: string }
    | { readonly kind: "cli_missing" }
  readonly diagnostics: {
    readonly broker: string
    readonly registration: string
  }
}

export const READY_SNAPSHOT: TestSnapshot = {
  brokerEpoch: "00000000-0000-4000-8000-000000000001",
  connected: true,
  sessions: [
    {
      id: "ses-current",
      title: "Current session",
      live: true,
      enabled: false,
    },
    {
      id: "ses-enabled",
      title: "Enabled session",
      live: true,
      enabled: true,
    },
  ],
  tailscale: { kind: "ready", stableUrl: "https://workstation.example.ts.net" },
  diagnostics: { broker: "connected", registration: "live" },
}

export class FakeDispatchControl {
  snapshotValue: TestSnapshot = READY_SNAPSHOT
  readonly enabled: string[] = []
  readonly disabled: string[] = []
  readonly #listeners = new Set<(snapshot: TestSnapshot) => void>()
  snapshots = 0
  subscriptionDisposals = 0
  disposals = 0
  failureCode: string | undefined

  async snapshot(): Promise<TestSnapshot> {
    this.snapshots += 1
    if (this.failureCode !== undefined)
      throw Object.assign(new Error("fixture"), { code: this.failureCode })
    return this.snapshotValue
  }

  async enable(input: {
    readonly sessionId: string
    readonly title: string
  }): Promise<TestSnapshot> {
    this.enabled.push(input.sessionId)
    this.snapshotValue = {
      ...this.snapshotValue,
      sessions: this.snapshotValue.sessions.map((session) =>
        session.id === input.sessionId ? { ...session, enabled: true } : session,
      ),
    }
    this.emit(this.snapshotValue)
    return this.snapshotValue
  }

  async disable(sessionId: string): Promise<TestSnapshot> {
    this.disabled.push(sessionId)
    this.snapshotValue = {
      ...this.snapshotValue,
      sessions: this.snapshotValue.sessions.map((session) =>
        session.id === sessionId ? { ...session, enabled: false } : session,
      ),
    }
    this.emit(this.snapshotValue)
    return this.snapshotValue
  }

  subscribe(listener: (snapshot: TestSnapshot) => void): () => void {
    this.#listeners.add(listener)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.#listeners.delete(listener)
      this.subscriptionDisposals += 1
    }
  }

  emit(snapshot: TestSnapshot): void {
    this.snapshotValue = snapshot
    for (const listener of this.#listeners) listener(snapshot)
  }

  async dispose(): Promise<void> {
    this.disposals += 1
  }
}

export function option(host: FakeTuiHost, id: string): TestMenuOption {
  const menu = host.menus.at(-1)
  const found = menu?.options.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`missing fixture option: ${id}`)
  return found
}
