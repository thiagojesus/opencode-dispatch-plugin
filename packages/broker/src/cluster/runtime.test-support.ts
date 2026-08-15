import { expect } from "bun:test"
import { join } from "node:path"

import { DispatchConfigSchema } from "@opencode-dispatch/contracts"

import type { SecurityStatePaths } from "../security/index.ts"

const implementation = Bun.file(new URL("./index.ts", import.meta.url))

export const BROKER_ORIGIN = "http://127.0.0.1:43110"
export const TEST_CONFIG = DispatchConfigSchema.parse({
  registration: { heartbeatIntervalMs: 50, ttlMs: 200 },
  reconnect: { initialDelayMs: 10, maxDelayMs: 40, maxAttempts: 8 },
})

export function temporaryStatePaths(directory: string): SecurityStatePaths {
  const stateDirectory = join(directory, "state")
  return {
    modePolicy: process.platform === "win32" ? "windows_user_local" : "posix",
    stateDirectory,
    hostSecretFile: join(stateDirectory, "host-secret"),
  }
}

export async function clusterModule() {
  expect(await implementation.exists()).toBe(true)
  return import("./index.ts")
}

export async function nextWebSocketMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.addEventListener(
      "message",
      (event) => {
        try {
          resolve(JSON.parse(String(event.data)))
        } catch (error) {
          reject(error)
        }
      },
      { once: true },
    )
    socket.addEventListener("error", () => reject(new TypeError("WebSocket failed.")), {
      once: true,
    })
  })
}

export async function openWebSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true })
    socket.addEventListener("error", () => reject(new TypeError("WebSocket failed.")), {
      once: true,
    })
  })
  return socket
}
