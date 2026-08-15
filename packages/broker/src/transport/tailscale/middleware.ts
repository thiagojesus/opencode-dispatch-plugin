import { LoopbackServerUrlSchema } from "@opencode-dispatch/contracts"

import { createTrustedBrowserEndpoint, verifyRemoteRequest } from "../../security/index.ts"
import { parseTailscaleIdentity } from "./identity.ts"
import type {
  TailscaleTransportDecision,
  TailscaleTransportErrorCode,
  TailscaleTransportGuard,
  TailscaleTransportGuardConfig,
} from "./types.ts"

export class TailscaleTransportConfigurationError extends Error {
  override readonly name = "TailscaleTransportConfigurationError"

  constructor(readonly code: "backend_not_loopback" | "endpoint_invalid") {
    super("Tailscale transport configuration is invalid.")
  }
}

function denied(
  code: TailscaleTransportErrorCode,
  httpStatus: 401 | 403,
): TailscaleTransportDecision {
  return { ok: false, error: { kind: "tailscale_transport_denial", code, httpStatus } }
}

function mapRequestDenial(code: string): TailscaleTransportDecision {
  switch (code) {
    case "request_identity_spoofed":
      return denied("identity_spoofed", 401)
    case "request_host_rejected":
      return denied("host_rejected", 403)
    case "request_origin_rejected":
      return denied("origin_rejected", 403)
    case "request_transport_rejected":
      return denied("transport_rejected", 401)
    default:
      return denied("transport_rejected", 401)
  }
}

export function createTailscaleTransportGuard(
  config: TailscaleTransportGuardConfig,
): TailscaleTransportGuard {
  if (!LoopbackServerUrlSchema.safeParse(config.backendOrigin).success) {
    throw new TailscaleTransportConfigurationError("backend_not_loopback")
  }
  let endpoint: ReturnType<typeof createTrustedBrowserEndpoint>
  try {
    endpoint = createTrustedBrowserEndpoint(config.setup.stableUrl)
  } catch {
    throw new TailscaleTransportConfigurationError("endpoint_invalid")
  }
  return (request) => {
    const requestDecision = verifyRemoteRequest(endpoint, request)
    if (!requestDecision.ok) {
      return mapRequestDenial(requestDecision.error.code)
    }
    return parseTailscaleIdentity(request.headers, config.setup.allowedLogin)
  }
}
