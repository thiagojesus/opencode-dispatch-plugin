import { describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
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

const windowsAclInspectionScript = [
  "$blocked = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')",
  "$securityModule = Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1'",
  "Import-Module -Name $securityModule -ErrorAction Stop",
  "$unsafe = (Microsoft.PowerShell.Security\\Get-Acl -LiteralPath $env:DISPATCH_ACL_TARGET).Access | Where-Object {",
  "  $_.AccessControlType -eq 'Allow' -and",
  "  $blocked -contains $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value",
  "}",
  "if ($null -ne $unsafe) { exit 1 }",
].join("\n")

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

  test.each([
    "\\\\server\\share\\alice\\AppData\\Local",
    "\\\\?\\UNC\\server\\share\\alice\\AppData\\Local",
    "\\\\?\\C:\\Users\\alice\\AppData\\Local",
    "\\\\.\\C:\\Users\\alice\\AppData\\Local",
    "C:\\ProgramData",
  ])("rejects non-user-local Windows state root %s", (localAppData) => {
    const resolveUnsafeRoot = () =>
      resolveSecurityStatePaths({
        platform: "win32",
        homeDirectory: "C:\\Users\\alice",
        environment: { localAppData },
      })

    expect(resolveUnsafeRoot).toThrow(SecurityError)
    expect(resolveUnsafeRoot).toThrow(expect.objectContaining({ code: "state_path_unavailable" }))
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

  test("fails closed when atomic publication collides with an invalid host-secret path", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-security-collision-"))
    const paths = temporaryStatePaths(fixtureDirectory)
    await mkdir(paths.hostSecretFile, { recursive: true })

    try {
      await expect(initializeHostSecret(paths)).rejects.toMatchObject({
        code: "secret_invalid",
      })
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("rejects a malformed existing host secret", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-security-malformed-"))
    const paths = temporaryStatePaths(fixtureDirectory)
    await mkdir(paths.stateDirectory, { recursive: true })
    await writeFile(paths.hostSecretFile, "malformed", { mode: 0o600 })

    try {
      await expect(initializeHostSecret(paths)).rejects.toMatchObject({
        code: "secret_invalid",
      })
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("inspects Windows ACLs without relying on PowerShell module autoload", () => {
    expect(windowsAclInspectionScript).toContain(
      "Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1'",
    )
    expect(windowsAclInspectionScript).toContain(
      "Import-Module -Name $securityModule -ErrorAction Stop",
    )
    expect(windowsAclInspectionScript).toContain("Microsoft.PowerShell.Security\\Get-Acl")
  })

  test.skipIf(process.platform !== "win32")(
    "inherits no broad read principal for a Windows user-local host secret",
    async () => {
      const { LOCALAPPDATA: localAppData } = process.env
      expect(localAppData).toBeDefined()
      if (localAppData === undefined) {
        return
      }
      const fixtureDirectory = await mkdtemp(join(localAppData, "dispatch-security-acl-"))
      const paths = temporaryStatePaths(fixtureDirectory)

      try {
        await initializeHostSecret(paths)
        const inspection = Bun.spawn(
          [
            "powershell.exe",
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            windowsAclInspectionScript,
          ],
          {
            env: { ...process.env, DISPATCH_ACL_TARGET: paths.hostSecretFile },
            stderr: "pipe",
            stdout: "pipe",
          },
        )
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(inspection.stdout).text(),
          new Response(inspection.stderr).text(),
          inspection.exited,
        ])
        expect(stdout).toBe("")
        expect(stderr).toBe("")
        expect(exitCode).toBe(0)
      } finally {
        await rm(fixtureDirectory, { force: true, recursive: true })
      }
    },
    20_000,
  )

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
