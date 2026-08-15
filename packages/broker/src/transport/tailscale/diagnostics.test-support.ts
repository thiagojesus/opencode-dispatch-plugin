import { CONTROL_CAPABILITY } from "../../../../contracts/src/index.ts"

import type { TailscaleCliResult, TailscaleCommandRunner, TailscaleReadCommand } from "./index.ts"

export const READY_STATUS = {
  BackendState: "Running",
  CertDomains: ["workstation.example.ts.net"],
  CurrentTailnet: {
    MagicDNSEnabled: true,
    MagicDNSSuffix: "example.ts.net",
  },
  Self: {
    CapMap: {
      [CONTROL_CAPABILITY]: [{}],
      https: null,
    },
    DNSName: "workstation.example.ts.net.",
    HostName: "workstation",
    UserID: 42,
  },
  User: {
    "42": { LoginName: "operator@example.com" },
  },
} as const

export const READY_SERVE_CONFIG = {
  TCP: {
    "443": { HTTPS: true },
  },
  Web: {
    "workstation.example.ts.net:443": {
      Handlers: {
        "/": {
          AcceptAppCaps: [CONTROL_CAPABILITY],
          Proxy: "http://127.0.0.1:43110",
        },
      },
    },
  },
} as const

function completed(stdout: string): TailscaleCliResult {
  return { kind: "completed", exitCode: 0, stderr: "", stdout }
}

export type RunnerFixture = {
  readonly calls: TailscaleReadCommand[]
  readonly runner: TailscaleCommandRunner
}

export function createRunnerFixture(
  overrides: Readonly<Record<string, TailscaleCliResult>> = {},
): RunnerFixture {
  const calls: TailscaleReadCommand[] = []
  const defaults: Readonly<Record<string, TailscaleCliResult>> = {
    "serve status --json": completed(JSON.stringify(READY_SERVE_CONFIG)),
    "status --json": completed(JSON.stringify(READY_STATUS)),
    version: completed("1.92.0\n"),
  }
  return {
    calls,
    runner: async (command) => {
      calls.push(command)
      return overrides[command.join(" ")] ?? defaults[command.join(" ")] ?? { kind: "unavailable" }
    },
  }
}

export function completedJson(value: unknown): TailscaleCliResult {
  return completed(JSON.stringify(value))
}
