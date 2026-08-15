import { Buffer } from "node:buffer"

import { z } from "zod"

export const BasicAuthorizationSchema = z
  .string()
  .regex(/^Basic [A-Za-z0-9+/]+={0,2}$/u)
  .brand<"BasicAuthorization">()
export type BasicAuthorization = z.infer<typeof BasicAuthorizationSchema>

export type OpenCodeServerEnvironment = {
  readonly OPENCODE_SERVER_PASSWORD?: string
  readonly OPENCODE_SERVER_USERNAME?: string
}

export function deriveOpenCodeAuthorization(
  environment: OpenCodeServerEnvironment,
): BasicAuthorization | undefined {
  const password = environment.OPENCODE_SERVER_PASSWORD
  if (password === undefined || password === "") {
    return undefined
  }
  const username = environment.OPENCODE_SERVER_USERNAME ?? "opencode"
  return BasicAuthorizationSchema.parse(
    `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
  )
}
