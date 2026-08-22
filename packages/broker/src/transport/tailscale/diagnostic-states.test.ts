import { describe, expect, test } from "bun:test"

import { CONTROL_CAPABILITY } from "../../../../contracts/src/index.ts"
import {
  completedJson,
  createRunnerFixture,
  READY_SERVE_CONFIG,
  READY_STATUS,
} from "./diagnostics.test-support.ts"
import { inspectTailscaleSetup } from "./index.ts"

describe("Tailscale setup blocker states", () => {
  test("requires MagicDNS before exposing a stable HTTPS URL", async () => {
    const fixture = createRunnerFixture({
      "status --json": completedJson({
        ...READY_STATUS,
        CurrentTailnet: { ...READY_STATUS.CurrentTailnet, MagicDNSEnabled: false },
      }),
    })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toEqual({ kind: "magicdns_unavailable" })
  })

  test("warns about certificate transparency before HTTPS certificate enablement", async () => {
    const fixture = createRunnerFixture({
      "status --json": completedJson({
        ...READY_STATUS,
        CertDomains: [],
        Self: {
          ...READY_STATUS.Self,
          CapMap: { [CONTROL_CAPABILITY]: [{}] },
          HostName: "confidential-client-project",
        },
      }),
    })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toEqual({
      kind: "https_unavailable",
      machineName: "confidential-client-project",
      stableUrl: "https://workstation.example.ts.net",
      warning: "certificate_transparency_public_name",
    })
  })

  test("does not treat local Self.CapMap as requester grant authority", async () => {
    const fixture = createRunnerFixture({
      "status --json": completedJson({
        ...READY_STATUS,
        Self: {
          ...READY_STATUS.Self,
          CapMap: {
            [CONTROL_CAPABILITY]: [{ role: "admin" }],
            https: [],
          },
        },
      }),
    })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toMatchObject({
      kind: "ready",
      grantVerification: "per_request",
      stableUrl: "https://workstation.example.ts.net",
    })
  })

  test("reports Serve off when no persistent Serve configuration exists", async () => {
    const fixture = createRunnerFixture({ "serve status --json": completedJson(null) })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toMatchObject({
      kind: "serve_off",
      stableUrl: "https://workstation.example.ts.net",
    })
    expect("allowedLogin" in setup ? String(setup.allowedLogin) : undefined).toBe(
      "operator@example.com",
    )
  })

  test("rejects Serve when app-capability forwarding is absent", async () => {
    const fixture = createRunnerFixture({
      "serve status --json": completedJson({
        ...READY_SERVE_CONFIG,
        Web: {
          "workstation.example.ts.net:443": {
            Handlers: { "/": { Proxy: "http://127.0.0.1:43111" } },
          },
        },
      }),
    })

    const setup = await inspectTailscaleSetup(fixture.runner)

    expect(setup).toMatchObject({
      kind: "serve_misconfigured",
      reason: "capability_forwarding_invalid",
    })
  })
})
