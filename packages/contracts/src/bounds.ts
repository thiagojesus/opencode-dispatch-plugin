import { MAX_PUBLIC_PAYLOAD_BYTES } from "./constants.ts"

const UTF8_ENCODER = new TextEncoder()

export function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength
}

export function isWithinPublicPayloadLimit(value: unknown): boolean {
  const serialized = JSON.stringify(value)
  return serialized !== undefined && utf8ByteLength(serialized) <= MAX_PUBLIC_PAYLOAD_BYTES
}
