import { Buffer } from "node:buffer"
import { createHmac, randomBytes } from "node:crypto"
import { SecurityError } from "./errors.ts"

const HOST_SECRET_BYTES = 32
const HOST_SECRET_LENGTH = 43
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u

export class HostSecret {
  readonly #serialized: string

  private constructor(serialized: string) {
    this.#serialized = serialized
  }

  static generate(): HostSecret {
    return new HostSecret(randomBytes(HOST_SECRET_BYTES).toString("base64url"))
  }

  static parse(serialized: string): HostSecret {
    const decoded = Buffer.from(serialized, "base64url")
    const isCanonical = decoded.toString("base64url") === serialized
    if (
      serialized.length !== HOST_SECRET_LENGTH ||
      !BASE64URL_PATTERN.test(serialized) ||
      decoded.byteLength !== HOST_SECRET_BYTES ||
      !isCanonical
    ) {
      throw new SecurityError("secret_invalid", "read_host_secret")
    }
    return new HostSecret(serialized)
  }

  serialize(): string {
    return this.#serialized
  }

  authenticate(payload: string): Buffer {
    return createHmac("sha256", this.#serialized).update(payload, "utf8").digest()
  }
}
