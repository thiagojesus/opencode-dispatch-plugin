import { realpath } from "node:fs/promises"
import { extname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createSecurityHeaders } from "../security/index.ts"

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
])

export const DEFAULT_PWA_ASSET_DIRECTORY = fileURLToPath(
  new URL("../../../../apps/pwa/dist/", import.meta.url),
)

function isContained(rootDirectory: string, candidate: string): boolean {
  const path = relative(rootDirectory, candidate)
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}

export async function servePwaAsset(request: Request, rootDirectory: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405 })
  }
  const url = new URL(request.url)
  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch (error) {
    if (error instanceof URIError) return new Response(null, { status: 400 })
    throw error
  }
  const root = await realpath(rootDirectory)
  const requestedPath = pathname === "/" ? "/index.html" : pathname
  const candidate = resolve(root, `.${requestedPath}`)
  const extension = extname(candidate)
  if (!isContained(root, candidate) || !CONTENT_TYPES.has(extension)) {
    return new Response(null, { status: 404 })
  }
  const asset = Bun.file(candidate)
  if (!(await asset.exists())) return new Response(null, { status: 404 })
  const resolvedCandidate = await realpath(candidate)
  if (!isContained(root, resolvedCandidate)) return new Response(null, { status: 404 })
  const resolvedAsset = Bun.file(resolvedCandidate)
  const headers = createSecurityHeaders("document")
  const contentType = CONTENT_TYPES.get(extension)
  if (contentType === undefined) return new Response(null, { status: 404 })
  headers.set("content-type", contentType)
  headers.set(
    "cache-control",
    requestedPath === "/index.html" ? "no-cache" : "public, max-age=3600",
  )
  return new Response(request.method === "HEAD" ? null : resolvedAsset, { headers })
}
