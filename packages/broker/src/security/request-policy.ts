import { type SecurityDecision, SecurityError, securityAllowed, securityDenied } from "./errors.ts"

const PROTECTED_IDENTITY_HEADERS = [
  "tailscale-app-capabilities",
  "tailscale-user-login",
  "tailscale-user-name",
  "tailscale-user-profile-pic",
] as const

export type TrustedBrowserEndpoint = {
  readonly origin: string
  readonly hostname: string
  readonly allowedHosts: readonly string[]
}

export type RemoteRequestMetadata = {
  readonly headers: Headers
  readonly ingress: "direct" | "trusted_proxy"
  readonly requiresOrigin: boolean
}

export type TrustedRequest = {
  readonly kind: "trusted_request"
}

function assertIngress(ingress: never): never {
  void ingress
  throw new SecurityError("configuration_invalid", "validate_request")
}

export function createTrustedBrowserEndpoint(value: string): TrustedBrowserEndpoint {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new SecurityError("configuration_invalid", "validate_request")
    }
    throw error
  }
  const hasCredentials = parsed.username.length > 0 || parsed.password.length > 0
  const hasUnexpectedParts =
    parsed.pathname !== "/" || parsed.search.length > 0 || parsed.hash.length > 0
  if (
    parsed.protocol !== "https:" ||
    hasCredentials ||
    hasUnexpectedParts ||
    !parsed.hostname.endsWith(".ts.net") ||
    (parsed.port.length > 0 && parsed.port !== "443")
  ) {
    throw new SecurityError("configuration_invalid", "validate_request")
  }
  const hostname = parsed.hostname.toLowerCase()
  return {
    origin: parsed.origin.toLowerCase(),
    hostname,
    allowedHosts: [hostname, `${hostname}:443`],
  }
}

function hasProtectedIdentityHeader(headers: Headers): boolean {
  return PROTECTED_IDENTITY_HEADERS.some((header) => headers.has(header))
}

function isTrustedOrigin(endpoint: TrustedBrowserEndpoint, origin: string): boolean {
  return origin.toLowerCase() === endpoint.origin
}

export function verifyRemoteRequest(
  endpoint: TrustedBrowserEndpoint,
  metadata: RemoteRequestMetadata,
): SecurityDecision<TrustedRequest> {
  switch (metadata.ingress) {
    case "direct":
      return hasProtectedIdentityHeader(metadata.headers)
        ? securityDenied("request_identity_spoofed", "validate_request")
        : securityDenied("request_transport_rejected", "validate_request")
    case "trusted_proxy":
      break
    default:
      return assertIngress(metadata.ingress)
  }
  const host = metadata.headers.get("host")?.toLowerCase()
  if (host === undefined || !endpoint.allowedHosts.includes(host)) {
    return securityDenied("request_host_rejected", "validate_request")
  }
  const origin = metadata.headers.get("origin")
  if (origin === null) {
    return metadata.requiresOrigin
      ? securityDenied("request_origin_rejected", "validate_request")
      : securityAllowed({ kind: "trusted_request" })
  }
  return isTrustedOrigin(endpoint, origin)
    ? securityAllowed({ kind: "trusted_request" })
    : securityDenied("request_origin_rejected", "validate_request")
}

export async function readBodyWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<SecurityDecision<Uint8Array>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new SecurityError("configuration_invalid", "read_request_body")
  }
  const declaredLength = request.headers.get("content-length")
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength)
    if (
      !/^(0|[1-9][0-9]*)$/u.test(declaredLength) ||
      !Number.isSafeInteger(parsedLength) ||
      parsedLength > maxBytes
    ) {
      return securityDenied("request_body_rejected", "read_request_body")
    }
  }
  if (request.body === null) {
    return securityAllowed(new Uint8Array())
  }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) {
        break
      }
      totalBytes += result.value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        return securityDenied("request_body_rejected", "read_request_body")
      }
      chunks.push(result.value)
    }
  } catch {
    return securityDenied("request_body_rejected", "read_request_body")
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return securityAllowed(body)
}
