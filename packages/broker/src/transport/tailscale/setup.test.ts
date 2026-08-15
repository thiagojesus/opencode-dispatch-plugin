import { describe, expect, test } from "bun:test"

import { CONTROL_CAPABILITY, TailscaleLoginSchema } from "../../../../contracts/src/index.ts"

import {
  createTailscaleGrantPolicy,
  createTailscaleServeCommand,
  parseTailscaleGrantPolicy,
} from "./index.ts"

describe("Tailscale setup artifacts", () => {
  test("generates the exact least-privilege control grant", () => {
    const login = TailscaleLoginSchema.parse("operator@example.com")

    const policy = createTailscaleGrantPolicy(login)

    expect(policy).toEqual({
      grants: [
        {
          app: { [CONTROL_CAPABILITY]: [{}] },
          dst: ["autogroup:self"],
          ip: ["tcp:443"],
          src: ["operator@example.com"],
        },
      ],
    })
    expect(parseTailscaleGrantPolicy(JSON.parse(JSON.stringify(policy)))).toEqual(policy)
  })

  test("returns the exact persistent Serve command after explicit confirmation", () => {
    const command = createTailscaleServeCommand("start", true)

    expect(command).toEqual({
      ok: true,
      argv: ["tailscale", "serve", "--bg", `--accept-app-caps=${CONTROL_CAPABILITY}`, "43110"],
    })
  })

  test("requires confirmation before returning the Serve start command", () => {
    const command = createTailscaleServeCommand("start", false)

    expect(command).toEqual({ ok: false, code: "confirmation_required" })
  })

  test("returns the Serve stop command only after explicit confirmation", () => {
    const command = createTailscaleServeCommand("stop", true)

    expect(command).toEqual({ ok: true, argv: ["tailscale", "serve", "off"] })
  })

  test("requires confirmation before returning the Serve stop command", () => {
    const command = createTailscaleServeCommand("stop", false)

    expect(command).toEqual({ ok: false, code: "confirmation_required" })
  })

  test("never generates public exposure or automatic setup commands", () => {
    const start = createTailscaleServeCommand("start", true)
    const stop = createTailscaleServeCommand("stop", true)

    expect(JSON.stringify([start, stop])).not.toMatch(/funnel|install|login|--yes/iu)
  })
})
