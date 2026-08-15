import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ProcessExposureSchema, ProcessLifecycleMessageSchema } from "@opencode-dispatch/contracts"

import { initializeHostSecret, type SecurityStatePaths } from "../security/index.ts"
import type { PersistedClusterState } from "./registry.ts"

const implementation = Bun.file(new URL("./state-store.ts", import.meta.url))
const NOW = 1_754_352_000_000

function temporaryStatePaths(directory: string): SecurityStatePaths {
  const stateDirectory = join(directory, "state")
  return {
    modePolicy: process.platform === "win32" ? "windows_user_local" : "posix",
    stateDirectory,
    hostSecretFile: join(stateDirectory, "host-secret"),
  }
}

function persistedState(index: number): PersistedClusterState {
  const processNonce = `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`
  const registration = ProcessLifecycleMessageSchema.parse({
    type: "process.register",
    version: 1,
    processNonce,
    serverUrl: `http://127.0.0.1:${40_000 + index}`,
    pid: 2_000 + index,
    startedAt: NOW + index,
  })
  if (registration.type !== "process.register") {
    throw new TypeError("Expected a process registration fixture.")
  }
  const exposure = ProcessExposureSchema.parse({
    version: 1,
    sessionId: `ses-state-${index}`,
    processNonce,
    title: `Persisted session ${index}`,
    enabledAt: NOW + index,
  })
  return {
    version: 1,
    registrations: [
      {
        processNonce: registration.processNonce,
        serverUrl: registration.serverUrl,
        pid: registration.pid,
        startedAt: registration.startedAt,
        lastSeenAt: NOW + index,
        expiresAt: NOW + 15_000,
        exposures: [exposure],
      },
    ],
  }
}

async function storeModule() {
  expect(await implementation.exists()).toBe(true)
  return import("./state-store.ts")
}

describe("cluster state store", () => {
  test("atomically persists only strict process and title-safe exposure metadata", async () => {
    const { ClusterStateStore } = await storeModule()
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-state-"))
    const paths = temporaryStatePaths(fixtureDirectory)

    try {
      await initializeHostSecret(paths)
      const store = new ClusterStateStore(paths)
      const expected = persistedState(1)

      await store.save(expected)

      expect(await store.load()).toEqual(expected)
      const serialized = await readFile(store.filePath, "utf8")
      expect(serialized).not.toContain("transcript")
      expect(serialized).not.toContain("eventBody")
      if (process.platform !== "win32") {
        expect((await stat(store.filePath)).mode & 0o777).toBe(0o600)
      }
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("serializes concurrent writes without leaving a partial state file", async () => {
    const { ClusterStateStore } = await storeModule()
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-state-"))
    const paths = temporaryStatePaths(fixtureDirectory)

    try {
      await initializeHostSecret(paths)
      const store = new ClusterStateStore(paths)

      await Promise.all([store.save(persistedState(1)), store.save(persistedState(2))])

      expect(await store.load()).toEqual(persistedState(2))
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })

  test("fails closed on malformed or over-broad persisted cluster state", async () => {
    const { ClusterError, ClusterStateStore } = await storeModule()
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "dispatch-cluster-state-"))
    const paths = temporaryStatePaths(fixtureDirectory)

    try {
      await initializeHostSecret(paths)
      const store = new ClusterStateStore(paths)
      await writeFile(
        store.filePath,
        JSON.stringify({ ...persistedState(1), transcript: "must not persist" }),
        { encoding: "utf8", mode: 0o600 },
      )

      await expect(store.load()).rejects.toBeInstanceOf(ClusterError)
      await expect(store.load()).rejects.toMatchObject({ code: "state_invalid" })
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true })
    }
  })
})
