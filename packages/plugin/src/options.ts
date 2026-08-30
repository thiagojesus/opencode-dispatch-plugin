import { DEFAULT_BROKER_PORT } from "@opencode-dispatch/contracts"
import { z } from "zod"

const DispatchPluginOptionsSchema = z
  .strictObject({
    port: z.number().int().min(1).max(65_535).default(DEFAULT_BROKER_PORT),
  })
  .readonly()

export type DispatchPluginOptions = z.infer<typeof DispatchPluginOptionsSchema>

export function parseDispatchPluginOptions(value: unknown): DispatchPluginOptions {
  return DispatchPluginOptionsSchema.parse(value ?? {})
}
