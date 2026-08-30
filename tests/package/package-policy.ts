export const PACKAGE_POLICY = {
  name: "opencode-dispatch-plugin",
  version: "0.1.0",
  engines: { opencode: ">=1.18.3 <2" },
  files: ["dist", "LICENSE"],
  maximumTarballBytes: 1_000_000,
  maximumUnpackedBytes: 3_000_000,
  maximumInitialCompressedBytes: 250_000,
} as const

const FIXED_PACKAGE_PATHS = new Set([
  "LICENSE",
  "package.json",
  "dist/server.js",
  "dist/tui.js",
  "dist/pwa/index.html",
  "dist/pwa/apple-touch-icon-180x180.png",
  "dist/pwa/icon.svg",
  "dist/pwa/manifest.webmanifest",
  "dist/pwa/registerSW.js",
  "dist/pwa/robots.txt",
  "dist/pwa/sw.js",
  "dist/pwa/favicon.ico",
  "dist/pwa/pwa-64x64.png",
  "dist/pwa/pwa-192x192.png",
  "dist/pwa/pwa-512x512.png",
  "dist/pwa/maskable-icon-512x512.png",
])

const GENERATED_PACKAGE_PATHS = [
  /^dist\/pwa\/assets\/[A-Za-z0-9._-]+\.(?:css|js|png|svg|woff2?)$/u,
  /^dist\/pwa\/workbox-[A-Za-z0-9._-]+\.js$/u,
] as const

const SECRET_PATTERNS = [
  /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u,
  /\bghp_[A-Za-z0-9]{36}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{60,}\b/u,
  /\bnpm_[A-Za-z0-9]{36}\b/u,
  /\bsk-[A-Za-z0-9_-]{32,}\b/u,
] as const

export function isAllowedPackagePath(path: string): boolean {
  return (
    FIXED_PACKAGE_PATHS.has(path) || GENERATED_PACKAGE_PATHS.some((pattern) => pattern.test(path))
  )
}

export function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value))
}

export function isExactVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)
}
