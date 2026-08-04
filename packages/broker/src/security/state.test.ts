import { describe, expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, posix, win32 } from "node:path"
import {
  initializeHostSecret,
  resolveSecurityStatePaths,
  SecurityError,
  type SecurityStatePaths,
} from "./index.ts"

function temporaryStatePaths(directory: string): SecurityStatePaths {
  const stateDirectory = join(directory, "state")
  return {
    modePolicy: process.platform === "win32" ? "windows_user_local" : "posix",
    stateDirectory,
    hostSecretFile: join(stateDirectory, "host-secret"),
  }
}

describe("security state", () => {
  test("publishes one stable owner-only host secret during concurrent initialization", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-security-state-"))
    const paths = temporaryStatePaths(fixtureDirectory)

    try {
      const secrets = await Promise.all(
        Array.from({ length: 16 }, () => initializeHostSecret(paths)),
      )
      const serializedSecrets = new Set(secrets.map((secret) => secret.serialize()))
      const persistedSecret = await readFile(paths.hostSecretFile, "utf8")
      expect(serializedSecrets.size).toBe(1)
      expect(serializedSecrets).toEqual(new Set([persistedSecret]))
      if (process.platform !== "win32") {
        const directoryMode = (await stat(paths.stateDirectory)).mode & 0o777
        const secretMode = (await stat(paths.hostSecretFile)).mode & 0o777
        expect(directoryMode).toBe(0o700)
        expect(secretMode).toBe(0o600)
      }
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("uses Windows user-local application data without claiming POSIX modes", () => {
    const localAppData = "C:\\Users\\alice\\AppData\\Local"

    const paths = resolveSecurityStatePaths({
      platform: "win32",
      homeDirectory: "C:\\Users\\alice",
      environment: { localAppData },
    })

    expect(paths).toEqual({
      modePolicy: "windows_user_local",
      stateDirectory: win32.join(localAppData, "opencode-dispatch-plugin"),
      hostSecretFile: win32.join(localAppData, "opencode-dispatch-plugin", "host-secret"),
    })
  })

  test("uses macOS Application Support instead of an injected XDG path", () => {
    const homeDirectory = "/Users/alice"

    const paths = resolveSecurityStatePaths({
      platform: "darwin",
      homeDirectory,
      environment: { xdgStateHome: "/tmp/injected-xdg" },
    })

    expect(paths).toEqual({
      modePolicy: "posix",
      stateDirectory: posix.join(
        homeDirectory,
        "Library",
        "Application Support",
        "opencode-dispatch-plugin",
      ),
      hostSecretFile: posix.join(
        homeDirectory,
        "Library",
        "Application Support",
        "opencode-dispatch-plugin",
        "host-secret",
      ),
    })
  })

  test("uses an absolute Linux XDG state root", () => {
    const xdgStateHome = "/state/alice"

    const paths = resolveSecurityStatePaths({
      platform: "linux",
      homeDirectory: "/home/alice",
      environment: { xdgStateHome },
    })

    expect(paths).toEqual({
      modePolicy: "posix",
      stateDirectory: posix.join(xdgStateHome, "opencode-dispatch-plugin"),
      hostSecretFile: posix.join(xdgStateHome, "opencode-dispatch-plugin", "host-secret"),
    })
  })

  test("fails closed instead of accepting a relative Linux XDG state root", () => {
    const resolveRelativeState = () =>
      resolveSecurityStatePaths({
        platform: "linux",
        homeDirectory: "/home/alice",
        environment: { xdgStateHome: "relative-state" },
      })

    expect(resolveRelativeState).toThrow(SecurityError)
    expect(resolveRelativeState).toThrow(
      expect.objectContaining({ code: "state_path_unavailable" }),
    )
  })

  test("fails closed when Windows user-local application data is unavailable", () => {
    const resolveWithoutUserLocalState = () =>
      resolveSecurityStatePaths({
        platform: "win32",
        homeDirectory: "C:\\Users\\alice",
        environment: {},
      })

    expect(resolveWithoutUserLocalState).toThrow(SecurityError)
    expect(resolveWithoutUserLocalState).toThrow(
      expect.objectContaining({ code: "state_path_unavailable" }),
    )
  })

  test("fails closed when the state location cannot be created", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-security-blocked-"))
    const blockedParent = join(fixtureDirectory, "blocked")
    await writeFile(blockedParent, "occupied", "utf8")
    const paths = temporaryStatePaths(blockedParent)

    try {
      await expect(initializeHostSecret(paths)).rejects.toMatchObject({
        code: "state_io_failed",
      })
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test.skipIf(process.platform === "win32")(
    "rejects an existing host secret with world-readable permissions",
    async () => {
      const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-security-mode-"))
      const paths = temporaryStatePaths(fixtureDirectory)

      try {
        await initializeHostSecret(paths)
        await chmod(paths.hostSecretFile, 0o644)

        await expect(initializeHostSecret(paths)).rejects.toMatchObject({
          code: "state_permissions_invalid",
        })
      } finally {
        await rm(fixtureDirectory, { force: true, recursive: true })
      }
    },
  )
})
