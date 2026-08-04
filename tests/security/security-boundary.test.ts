import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createInternalAuthResponse,
  createTrustedBrowserEndpoint,
  InternalAuthVerifier,
  initializeHostSecret,
  redactStructured,
  type SecurityStatePaths,
  verifyRemoteRequest,
} from "../../packages/broker/src/security/index.ts"

test("security boundary composes private state, authenticated control, and trusted ingress", async () => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-security-boundary-"))
  const stateDirectory = join(fixtureDirectory, "state")
  const paths: SecurityStatePaths = {
    modePolicy: process.platform === "win32" ? "windows_user_local" : "posix",
    stateDirectory,
    hostSecretFile: join(stateDirectory, "host-secret"),
  }

  try {
    const secret = await initializeHostSecret(paths)
    const verifier = new InternalAuthVerifier(secret, {
      challengeTtlMs: 30_000,
      maxChallenges: 8,
      now: () => 1_000_000,
    })
    const challenge = verifier.issueChallenge()
    const response = createInternalAuthResponse(secret, challenge, "cluster.register:v1")
    const internalDecision = verifier.verify(response, "cluster.register:v1")
    const endpoint = createTrustedBrowserEndpoint("https://workstation.example.ts.net")
    const remoteDecision = verifyRemoteRequest(endpoint, {
      headers: new Headers({
        host: "workstation.example.ts.net",
        origin: "https://workstation.example.ts.net",
      }),
      ingress: "trusted_proxy",
      requiresOrigin: true,
    })
    const diagnostic = redactStructured({
      Authorization: `Bearer ${secret.serialize()}`,
      prompt: "PRIVATE_PROMPT_SENTINEL",
    })

    expect(internalDecision).toMatchObject({ ok: true })
    expect(remoteDecision).toMatchObject({ ok: true })
    expect(JSON.stringify(diagnostic)).not.toContain(secret.serialize())
    expect(JSON.stringify(diagnostic)).not.toContain("PRIVATE_PROMPT_SENTINEL")
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true })
  }
})
