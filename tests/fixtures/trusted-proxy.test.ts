import { expect, test } from "bun:test"

import { CONTROL_CAPABILITY } from "../../packages/contracts/src/index.ts"

const implementation = Bun.file(new URL("./trusted-proxy.ts", import.meta.url))

test("strips spoofed Tailscale headers before injecting trusted identity and capability", async () => {
  expect(await implementation.exists()).toBe(true)
  const { startOpenCodeFixture } = await import("./open-code.ts")
  const { startTrustedProxyFixture } = await import("./trusted-proxy.ts")
  const upstream = await startOpenCodeFixture({ compatibility: "1.18.3" })
  const proxy = await startTrustedProxyFixture({
    identity: {
      login: "fixture-user@example.test",
      name: "Fixture User",
      profilePicture: "https://example.test/fixture.png",
    },
    targetOrigin: upstream.origin,
  })

  try {
    const response = await fetch(new URL(upstream.routes.health, proxy.origin), {
      headers: {
        "tailscale-app-capabilities": JSON.stringify({ attacker: [{}] }),
        "tailscale-user-login": "attacker@example.test",
        "tailscale-user-name": "Attacker",
        "tailscale-user-profile-pic": "https://example.test/attacker.png",
      },
    })
    const [forwarded] = proxy.requests()

    expect(response.status).toBe(200)
    expect(forwarded?.headers.get("tailscale-user-login")).toBe("fixture-user@example.test")
    expect(forwarded?.headers.get("tailscale-user-name")).toBe("Fixture User")
    expect(forwarded?.headers.get("tailscale-app-capabilities")).toBe(
      JSON.stringify({ [CONTROL_CAPABILITY]: [{}] }),
    )
    expect(JSON.stringify(forwarded)).not.toContain("attacker@example.test")
  } finally {
    await Promise.all([proxy.stop(), upstream.stop()])
  }
})
