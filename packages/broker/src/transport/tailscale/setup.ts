import { assertNever, CONTROL_CAPABILITY, type TailscaleLogin } from "@opencode-dispatch/contracts"
import { z } from "zod"

const EmptyControlParametersSchema = z.tuple([z.strictObject({})]).readonly()

export const TailscaleGrantPolicySchema = z
  .strictObject({
    grants: z
      .tuple([
        z
          .strictObject({
            app: z.strictObject({ [CONTROL_CAPABILITY]: EmptyControlParametersSchema }).readonly(),
            dst: z.tuple([z.literal("autogroup:self")]).readonly(),
            ip: z.tuple([z.literal("tcp:443")]).readonly(),
            src: z.tuple([z.string().email()]).readonly(),
          })
          .readonly(),
      ])
      .readonly(),
  })
  .readonly()

export type TailscaleGrantPolicy = z.infer<typeof TailscaleGrantPolicySchema>
export type TailscaleServeAction = "start" | "stop"
export type TailscaleServeCommandDecision =
  | { readonly ok: true; readonly argv: readonly string[] }
  | { readonly ok: false; readonly code: "confirmation_required" }

export function createTailscaleGrantPolicy(login: TailscaleLogin): TailscaleGrantPolicy {
  return TailscaleGrantPolicySchema.parse({
    grants: [
      {
        app: { [CONTROL_CAPABILITY]: [{}] },
        dst: ["autogroup:self"],
        ip: ["tcp:443"],
        src: [login],
      },
    ],
  })
}

export function parseTailscaleGrantPolicy(value: unknown): TailscaleGrantPolicy {
  return TailscaleGrantPolicySchema.parse(value)
}

export function createTailscaleServeCommand(
  action: TailscaleServeAction,
  confirmed: boolean,
): TailscaleServeCommandDecision {
  if (!confirmed) {
    return { ok: false, code: "confirmation_required" }
  }
  switch (action) {
    case "start":
      return {
        ok: true,
        argv: ["tailscale", "serve", "--bg", `--accept-app-caps=${CONTROL_CAPABILITY}`, "43110"],
      }
    case "stop":
      return { ok: true, argv: ["tailscale", "serve", "off"] }
    default:
      return assertNever(action)
  }
}
