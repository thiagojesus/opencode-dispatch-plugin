import { expect, test } from "bun:test"

const implementation = Bun.file(new URL("./index.ts", import.meta.url))

test("derives optional Basic authorization with the OpenCode default username", async () => {
  expect(await implementation.exists()).toBe(true)
  const { deriveOpenCodeAuthorization } = await import("./index.ts")

  expect(
    String(deriveOpenCodeAuthorization({ OPENCODE_SERVER_PASSWORD: "fixture-password" })),
  ).toBe("Basic b3BlbmNvZGU6Zml4dHVyZS1wYXNzd29yZA==")
  expect(
    String(
      deriveOpenCodeAuthorization({
        OPENCODE_SERVER_USERNAME: "fixture-user",
        OPENCODE_SERVER_PASSWORD: "fixture-password",
      }),
    ),
  ).toBe("Basic Zml4dHVyZS11c2VyOmZpeHR1cmUtcGFzc3dvcmQ=")
  expect(deriveOpenCodeAuthorization({ OPENCODE_SERVER_USERNAME: "ignored" })).toBeUndefined()
})
