import { randomUUID } from "node:crypto"
import { chmod, lstat, open, readFile, rename, rm } from "node:fs/promises"
import { join } from "node:path"

import {
  LoopbackServerUrlSchema,
  ProcessExposureSchema,
  ProcessIdSchema,
  ProcessInstanceNonceSchema,
  UnixEpochMsSchema,
} from "@opencode-dispatch/contracts"
import { z } from "zod"

import type { SecurityStatePaths } from "../security/index.ts"
import { ClusterError } from "./errors.ts"
import type { PersistedClusterState } from "./registry.ts"

const CLUSTER_STATE_FILE_NAME = "cluster-state.json"
const POSIX_FILE_MODE = 0o600
const MAX_STATE_BYTES = 1_024 * 1_024
const MAX_REGISTRATIONS = 128
const MAX_EXPOSURES_PER_REGISTRATION = 256

const PersistedRegistrationSchema = z
  .strictObject({
    processNonce: ProcessInstanceNonceSchema,
    serverUrl: LoopbackServerUrlSchema,
    pid: ProcessIdSchema,
    startedAt: UnixEpochMsSchema,
    lastSeenAt: UnixEpochMsSchema,
    expiresAt: UnixEpochMsSchema,
    exposures: z.array(ProcessExposureSchema).max(MAX_EXPOSURES_PER_REGISTRATION).readonly(),
  })
  .readonly()

const PersistedClusterStateSchema = z
  .strictObject({
    version: z.literal(1),
    registrations: z.array(PersistedRegistrationSchema).max(MAX_REGISTRATIONS).readonly(),
  })
  .readonly()

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

export class ClusterStateStore {
  readonly filePath: string
  readonly #paths: SecurityStatePaths
  #writeQueue: Promise<void> = Promise.resolve()

  constructor(paths: SecurityStatePaths) {
    this.#paths = paths
    this.filePath = join(paths.stateDirectory, CLUSTER_STATE_FILE_NAME)
  }

  async load(): Promise<PersistedClusterState> {
    try {
      const state = await lstat(this.filePath)
      if (state.isSymbolicLink() || !state.isFile() || state.size > MAX_STATE_BYTES) {
        throw new ClusterError("state_invalid")
      }
      if (this.#paths.modePolicy === "posix" && (state.mode & 0o777) !== POSIX_FILE_MODE) {
        throw new ClusterError("state_invalid")
      }
      const serialized = await readFile(this.filePath, "utf8")
      const value: unknown = JSON.parse(serialized)
      const parsed = PersistedClusterStateSchema.safeParse(value)
      if (!parsed.success) {
        throw new ClusterError("state_invalid")
      }
      return parsed.data
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) {
        return { version: 1, registrations: [] }
      }
      if (error instanceof ClusterError) {
        throw error
      }
      if (error instanceof SyntaxError) {
        throw new ClusterError("state_invalid")
      }
      throw new ClusterError("state_io_failed")
    }
  }

  save(state: PersistedClusterState): Promise<void> {
    const parsed = PersistedClusterStateSchema.safeParse(state)
    if (!parsed.success) {
      return Promise.reject(new ClusterError("state_invalid"))
    }
    const write = () => this.#write(parsed.data)
    const next = this.#writeQueue.then(write, write)
    this.#writeQueue = next
    return next
  }

  async #write(state: PersistedClusterState): Promise<void> {
    const temporaryPath = join(
      this.#paths.stateDirectory,
      `.${CLUSTER_STATE_FILE_NAME}.${randomUUID()}.tmp`,
    )
    try {
      const handle = await open(temporaryPath, "wx", POSIX_FILE_MODE)
      try {
        await handle.writeFile(JSON.stringify(state), "utf8")
        await handle.sync()
      } finally {
        await handle.close()
      }
      if (this.#paths.modePolicy === "posix") {
        await chmod(temporaryPath, POSIX_FILE_MODE)
      }
      await rename(temporaryPath, this.filePath)
    } catch (error) {
      if (error instanceof ClusterError) {
        throw error
      }
      throw new ClusterError("state_io_failed")
    } finally {
      await rm(temporaryPath, { force: true })
    }
  }
}

export { ClusterError } from "./errors.ts"
