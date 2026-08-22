export { createTailscaleCliRunner, type TailscaleCliRunnerConfig } from "./cli.ts"
export { TAILSCALE_SERVE_TARGET_ORIGIN, TAILSCALE_SERVE_TARGET_PORT } from "./constants.ts"
export { inspectTailscaleSetup } from "./diagnostics.ts"
export { decodeTailscaleHeaderValue, parseTailscaleIdentity } from "./identity.ts"
export {
  createTailscaleTransportGuard,
  TailscaleTransportConfigurationError,
} from "./middleware.ts"
export {
  createTailscaleGrantPolicy,
  createTailscaleServeCommand,
  parseTailscaleGrantPolicy,
  type TailscaleGrantPolicy,
  TailscaleGrantPolicySchema,
  type TailscaleServeAction,
  type TailscaleServeCommandDecision,
} from "./setup.ts"
export type {
  TailscaleCliResult,
  TailscaleCommandRunner,
  TailscaleReadCommand,
  TailscaleReadySetup,
  TailscaleRemoteRequest,
  TailscaleServeMisconfiguration,
  TailscaleSetupState,
  TailscaleTransportDecision,
  TailscaleTransportDenial,
  TailscaleTransportErrorCode,
  TailscaleTransportGuard,
  TailscaleTransportGuardConfig,
} from "./types.ts"
