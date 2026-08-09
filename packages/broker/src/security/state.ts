import { randomUUID } from "node:crypto"
import { chmod, link, lstat, mkdir, open, readFile, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { join, posix, win32 } from "node:path"
import { SecurityError } from "./errors.ts"
import { HostSecret } from "./host-secret.ts"

const STATE_DIRECTORY_NAME = "opencode-dispatch-plugin"
const HOST_SECRET_FILE_NAME = "host-secret"
const POSIX_DIRECTORY_MODE = 0o700
const POSIX_FILE_MODE = 0o600
const MAX_SECRET_FILE_BYTES = 128
const WINDOWS_DRIVE_ROOT_PATTERN = /^[A-Za-z]:\\/u

type StatePathEnvironment = {
  readonly localAppData?: string
  readonly xdgStateHome?: string
}

export type StatePathInput = {
  readonly platform: NodeJS.Platform
  readonly homeDirectory: string
  readonly environment: StatePathEnvironment
}

type StatePathValues = {
  readonly stateDirectory: string
  readonly hostSecretFile: string
}

export type SecurityStatePaths =
  | (StatePathValues & { readonly modePolicy: "posix" })
  | (StatePathValues & { readonly modePolicy: "windows_user_local" })

function assertModePolicy(paths: never): never {
  void paths
  throw new SecurityError("configuration_invalid", "prepare_state_directory")
}

function enforcesPosixModes(paths: SecurityStatePaths): boolean {
  switch (paths.modePolicy) {
    case "posix":
      return true
    case "windows_user_local":
      return false
    default:
      return assertModePolicy(paths)
  }
}

function resolveWindowsStatePaths(input: StatePathInput): SecurityStatePaths {
  const configuredRoot = input.environment.localAppData
  if (configuredRoot === undefined) {
    throw new SecurityError("state_path_unavailable", "resolve_state_path")
  }
  const root = win32.normalize(configuredRoot)
  const homeDirectory = win32.normalize(input.homeDirectory)
  const relativeToHome = win32.relative(homeDirectory, root)
  const isWithinHome =
    relativeToHome === "" ||
    (!win32.isAbsolute(relativeToHome) &&
      relativeToHome !== ".." &&
      !relativeToHome.startsWith(`..${win32.sep}`))
  if (
    !WINDOWS_DRIVE_ROOT_PATTERN.test(root) ||
    !WINDOWS_DRIVE_ROOT_PATTERN.test(homeDirectory) ||
    !isWithinHome
  ) {
    throw new SecurityError("state_path_unavailable", "resolve_state_path")
  }
  const stateDirectory = win32.join(root, STATE_DIRECTORY_NAME)
  return {
    modePolicy: "windows_user_local",
    stateDirectory,
    hostSecretFile: win32.join(stateDirectory, HOST_SECRET_FILE_NAME),
  }
}

function resolvePosixStatePaths(input: StatePathInput): SecurityStatePaths {
  if (!posix.isAbsolute(input.homeDirectory)) {
    throw new SecurityError("state_path_unavailable", "resolve_state_path")
  }
  const configuredRoot = input.platform === "darwin" ? undefined : input.environment.xdgStateHome
  if (configuredRoot !== undefined && !posix.isAbsolute(configuredRoot)) {
    throw new SecurityError("state_path_unavailable", "resolve_state_path")
  }
  const defaultRoot =
    input.platform === "darwin"
      ? posix.join(input.homeDirectory, "Library", "Application Support")
      : posix.join(input.homeDirectory, ".local", "state")
  const stateDirectory = posix.join(configuredRoot ?? defaultRoot, STATE_DIRECTORY_NAME)
  return {
    modePolicy: "posix",
    stateDirectory,
    hostSecretFile: posix.join(stateDirectory, HOST_SECRET_FILE_NAME),
  }
}

export function resolveSecurityStatePaths(input: StatePathInput): SecurityStatePaths {
  return input.platform === "win32"
    ? resolveWindowsStatePaths(input)
    : resolvePosixStatePaths(input)
}

export function resolveCurrentSecurityStatePaths(): SecurityStatePaths {
  const { LOCALAPPDATA: localAppData, XDG_STATE_HOME: xdgStateHome } = process.env
  return resolveSecurityStatePaths({
    platform: process.platform,
    homeDirectory: homedir(),
    environment: {
      ...(localAppData === undefined ? {} : { localAppData }),
      ...(xdgStateHome === undefined ? {} : { xdgStateHome }),
    },
  })
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

async function prepareStateDirectory(paths: SecurityStatePaths): Promise<void> {
  await mkdir(paths.stateDirectory, { mode: POSIX_DIRECTORY_MODE, recursive: true })
  const state = await lstat(paths.stateDirectory)
  if (state.isSymbolicLink() || !state.isDirectory()) {
    throw new SecurityError("state_permissions_invalid", "prepare_state_directory")
  }
  if (enforcesPosixModes(paths)) {
    await chmod(paths.stateDirectory, POSIX_DIRECTORY_MODE)
  }
}

async function readHostSecret(paths: SecurityStatePaths): Promise<HostSecret> {
  const state = await lstat(paths.hostSecretFile)
  if (state.isSymbolicLink() || !state.isFile() || state.size > MAX_SECRET_FILE_BYTES) {
    throw new SecurityError("secret_invalid", "read_host_secret")
  }
  if (enforcesPosixModes(paths) && (state.mode & 0o777) !== POSIX_FILE_MODE) {
    throw new SecurityError("state_permissions_invalid", "read_host_secret")
  }
  return HostSecret.parse(await readFile(paths.hostSecretFile, "utf8"))
}

async function publishHostSecret(paths: SecurityStatePaths): Promise<void> {
  const candidateSecret = HostSecret.generate()
  const candidatePath = join(paths.stateDirectory, `.${HOST_SECRET_FILE_NAME}.${randomUUID()}.tmp`)
  try {
    const handle = await open(candidatePath, "wx", POSIX_FILE_MODE)
    try {
      await handle.writeFile(candidateSecret.serialize(), "utf8")
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (enforcesPosixModes(paths)) {
      await chmod(candidatePath, POSIX_FILE_MODE)
    }
    try {
      await link(candidatePath, paths.hostSecretFile)
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) {
        throw error
      }
    }
  } finally {
    await rm(candidatePath, { force: true })
  }
}

export async function initializeHostSecret(
  paths: SecurityStatePaths = resolveCurrentSecurityStatePaths(),
): Promise<HostSecret> {
  try {
    await prepareStateDirectory(paths)
    await publishHostSecret(paths)
    return await readHostSecret(paths)
  } catch (error) {
    if (error instanceof SecurityError) {
      throw error
    }
    throw new SecurityError("state_io_failed", "create_host_secret")
  }
}
