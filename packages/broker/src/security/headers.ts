import { SecurityError } from "./errors.ts"

export type SecurityHeaderScope = "api" | "document"

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "worker-src 'self'",
].join("; ")

const BASE_SECURITY_HEADERS = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy":
    "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} satisfies Readonly<Record<string, string>>

function assertHeaderScope(unexpectedScope: never): never {
  void unexpectedScope
  throw new SecurityError("configuration_invalid", "create_security_headers")
}

export function createSecurityHeaders(scope: SecurityHeaderScope): Headers {
  const headers = new Headers(BASE_SECURITY_HEADERS)
  switch (scope) {
    case "api":
      headers.set("cache-control", "no-store")
      headers.set("pragma", "no-cache")
      return headers
    case "document":
      return headers
    default:
      return assertHeaderScope(scope)
  }
}
