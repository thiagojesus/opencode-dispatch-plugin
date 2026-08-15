import {
  CONTROL_CAPABILITY,
  type TailscaleLogin,
  TailscaleLoginSchema,
  TransportIdentitySchema,
} from "@opencode-dispatch/contracts"
import { z } from "zod"

import type { TailscaleTransportDecision, TailscaleTransportErrorCode } from "./types.ts"

const MAX_HEADER_LENGTH = 8_192
const ENCODED_WORD_PATTERN = /^=\?([^?]+)\?([qQ])\?([^?]*)\?=$/u
const HEX_BYTE_PATTERN = /^[0-9A-Fa-f]{2}$/u
const AppCapabilitiesSchema = z.strictObject({
  [CONTROL_CAPABILITY]: z.tuple([z.strictObject({})]),
})

function denied(
  code: TailscaleTransportErrorCode,
  httpStatus: 401 | 403,
): TailscaleTransportDecision {
  return { ok: false, error: { kind: "tailscale_transport_denial", code, httpStatus } }
}

function decodeQText(value: string): string | undefined {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === undefined) {
      return undefined
    }
    if (character === "_") {
      bytes.push(32)
      continue
    }
    if (character === "=") {
      const encodedByte = value.slice(index + 1, index + 3)
      if (!HEX_BYTE_PATTERN.test(encodedByte)) {
        return undefined
      }
      bytes.push(Number.parseInt(encodedByte, 16))
      index += 2
      continue
    }
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined || codePoint < 33 || codePoint > 126 || character === "?") {
      return undefined
    }
    bytes.push(codePoint)
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes))
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined
    }
    throw error
  }
}

export function decodeTailscaleHeaderValue(value: string): string | undefined {
  if (value.length === 0 || value.length > MAX_HEADER_LENGTH || /[\0\r\n]/u.test(value)) {
    return undefined
  }
  if (!value.startsWith("=?")) {
    for (const character of value) {
      const codePoint = character.codePointAt(0)
      if (codePoint === undefined || codePoint < 32 || codePoint > 126) {
        return undefined
      }
    }
    return value
  }
  const match = ENCODED_WORD_PATTERN.exec(value)
  const charset = match?.[1]
  const encodedText = match?.[3]
  if (charset?.toLowerCase() !== "utf-8" || encodedText === undefined) {
    return undefined
  }
  return decodeQText(encodedText)
}

export function parseTailscaleIdentity(
  headers: Headers,
  expectedLogin: TailscaleLogin,
): TailscaleTransportDecision {
  const rawLogin = headers.get("tailscale-user-login")
  if (rawLogin === null) {
    return denied("identity_missing", 401)
  }
  const decodedLogin = decodeTailscaleHeaderValue(rawLogin)
  const login = TailscaleLoginSchema.safeParse(decodedLogin)
  if (!login.success) {
    return denied("identity_malformed", 401)
  }
  if (login.data !== expectedLogin) {
    return denied("identity_mismatch", 401)
  }
  const rawCapabilities = headers.get("tailscale-app-capabilities")
  if (rawCapabilities === null) {
    return denied("capability_missing", 403)
  }
  const decodedCapabilities = decodeTailscaleHeaderValue(rawCapabilities)
  if (decodedCapabilities === undefined) {
    return denied("capability_malformed", 403)
  }
  let parsedCapabilities: unknown
  try {
    parsedCapabilities = JSON.parse(decodedCapabilities)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return denied("capability_malformed", 403)
    }
    throw error
  }
  if (!AppCapabilitiesSchema.safeParse(parsedCapabilities).success) {
    return denied("capability_denied", 403)
  }
  const identity = TransportIdentitySchema.parse({
    capability: CONTROL_CAPABILITY,
    login: login.data,
  })
  return { ok: true, value: identity }
}
