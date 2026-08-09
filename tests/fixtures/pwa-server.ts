import { readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { extname, isAbsolute, relative, resolve } from "node:path"

import { LoopbackServerUrlSchema } from "../../packages/contracts/src/index.ts"
import { FixtureAssetMissingError, FixtureConfigurationError } from "./errors.ts"

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
])

export type PwaServerFixture = {
  readonly origin: string
  stop(): Promise<void>
}

export type PwaServerFixtureOptions = {
  readonly rootDirectory: string
}

type StaticRequest = {
  readonly request: IncomingMessage
  readonly response: ServerResponse
  readonly rootDirectory: string
  readonly indexPath: string
  readonly indexBody: Uint8Array
}

function contentType(pathname: string): string {
  const extension = extname(pathname)
  return CONTENT_TYPES.get(extension) ?? "application/octet-stream"
}

function isContained(rootDirectory: string, candidate: string): boolean {
  const path = relative(rootDirectory, candidate)
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}

async function readAsset(path: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path)
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "EISDIR")
    ) {
      return null
    }
    throw error
  }
}

function sendResponse(
  response: ServerResponse,
  payload: { readonly status: number; readonly contentType?: string; readonly body?: Uint8Array },
): void {
  if (payload.contentType === undefined) {
    response.writeHead(payload.status)
  } else {
    response.writeHead(payload.status, { "content-type": payload.contentType })
  }
  response.end(payload.body)
}

async function handleStaticRequest(context: StaticRequest): Promise<void> {
  const method = context.request.method ?? "GET"
  if (method !== "GET" && method !== "HEAD") {
    sendResponse(context.response, { status: 405 })
    return
  }
  const url = new URL(context.request.url ?? "/", "http://fixture.invalid")
  if (url.pathname.startsWith("/api/")) {
    sendResponse(context.response, { status: 404 })
    return
  }
  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch (error) {
    if (error instanceof URIError) {
      sendResponse(context.response, { status: 400 })
      return
    }
    throw error
  }
  const candidate = resolve(context.rootDirectory, `.${pathname}`)
  if (!isContained(context.rootDirectory, candidate)) {
    sendResponse(context.response, { status: 404 })
    return
  }
  const assetBody = pathname === "/" ? null : await readAsset(candidate)
  if (assetBody === null && extname(pathname).length > 0) {
    sendResponse(context.response, { status: 404 })
    return
  }
  const selectedPath = assetBody === null ? context.indexPath : candidate
  const selectedBody = assetBody ?? context.indexBody
  const response = { status: 200, contentType: contentType(selectedPath) } as const
  if (method === "HEAD") {
    sendResponse(context.response, response)
    return
  }
  sendResponse(context.response, { ...response, body: selectedBody })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) {
        resolveClose()
        return
      }
      rejectClose(error)
    })
    server.closeAllConnections()
  })
}

export async function startPwaServerFixture(
  options: PwaServerFixtureOptions,
): Promise<PwaServerFixture> {
  const rootDirectory = resolve(options.rootDirectory)
  const indexPath = resolve(rootDirectory, "index.html")
  const indexBody = await readAsset(indexPath)
  if (indexBody === null) {
    throw new FixtureAssetMissingError()
  }
  const server = createServer((request, response) => {
    handleStaticRequest({ request, response, rootDirectory, indexPath, indexBody }).catch(
      (error) => {
        if (!response.headersSent) {
          sendResponse(response, { status: 500 })
          return
        }
        response.destroy(error instanceof Error ? error : undefined)
      },
    )
  })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen)
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      server.off("error", rejectListen)
      resolveListen()
    })
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    await closeServer(server)
    throw new FixtureConfigurationError("serverAddress")
  }

  return {
    origin: LoopbackServerUrlSchema.parse(`http://127.0.0.1:${address.port}`),
    stop: () => closeServer(server),
  }
}
