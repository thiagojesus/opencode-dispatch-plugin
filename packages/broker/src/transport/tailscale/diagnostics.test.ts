import { describe, expect, test } from "bun:test"

import { CONTROL_CAPABILITY } from "../../../../contracts/src/index.ts"
import {
  completedJson,
  createRunnerFixture,
  READY_SERVE_CONFIG,
  READY_STATUS,
} from "./diagnostics.test-support.ts"
import { inspectTailscaleSetup } from "./index.ts"

describe("Tailscale setup diagnostics", () => {
  test("reports transport readiness while verifying grants per request", async () => {
    const fixture = createRunnerFixture()

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toMatchObject({
      kind: "ready",
      grantVerification: "per_request",
      machineName: "workstation",
      stableUrl: "https://workstation.example.ts.net",
    })
    expect("allowedLogin" in setup ? String(setup.allowedLogin) : undefined).toBe(
      "operator@example.com",
    )
    expect(fixture.calls).toEqual([
      ["version"],
      ["status", "--json"],
      ["serve", "status", "--json"],
    ])
  })

  test("reports a missing CLI without attempting installation", async () => {
    const fixture = createRunnerFixture({ version: { kind: "unavailable" } })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toEqual({ kind: "cli_missing" })
    expect(fixture.calls).toEqual([["version"]])
  })

  test("rejects a Tailscale version older than 1.92", async () => {
    const fixture = createRunnerFixture({
      version: { kind: "completed", exitCode: 0, stderr: "", stdout: "1.91.9\n" },
    })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toEqual({ kind: "version_unsupported", version: "1.91.9" })
    expect(fixture.calls).toEqual([["version"]])
  })

  test("reports logged-out state without invoking login", async () => {
    const fixture = createRunnerFixture({
      "status --json": completedJson({ ...READY_STATUS, BackendState: "NeedsLogin" }),
    })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toEqual({ kind: "logged_out", backendState: "NeedsLogin" })
    expect(fixture.calls).toEqual([["version"], ["status", "--json"]])
  })

  test("rejects malformed status output with a typed diagnostic", async () => {
    const fixture = createRunnerFixture({
      "status --json": {
        kind: "completed",
        exitCode: 0,
        stderr: "",
        stdout: "not-json",
      },
    })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toEqual({ kind: "status_invalid" })
  })

  test("rejects a Serve configuration that enables Funnel", async () => {
    const fixture = createRunnerFixture({
      "serve status --json": completedJson({
        ...READY_SERVE_CONFIG,
        AllowFunnel: { "workstation.example.ts.net:443": true },
      }),
    })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toMatchObject({ kind: "serve_misconfigured", reason: "funnel_enabled" })
  })

  test("rejects a Serve proxy that does not target the loopback broker", async () => {
    const fixture = createRunnerFixture({
      "serve status --json": completedJson({
        ...READY_SERVE_CONFIG,
        Web: {
          "workstation.example.ts.net:443": {
            Handlers: {
              "/": {
                AcceptAppCaps: [CONTROL_CAPABILITY],
                Proxy: "http://0.0.0.0:43110",
              },
            },
          },
        },
      }),
    })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toMatchObject({ kind: "serve_misconfigured", reason: "target_invalid" })
  })
})
