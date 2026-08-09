import { FixtureConfigurationError } from "./errors.ts"

const memberId = process.env["FIXTURE_MEMBER_ID"]
if (memberId === undefined) {
  throw new FixtureConfigurationError("memberId")
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const url = new URL(request.url)
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ memberId, pid: process.pid })
    }
    return Response.json({ error: "fixture_route_not_found" }, { status: 404 })
  },
})

process.stdout.write(
  `${JSON.stringify({ memberId, origin: server.url.origin, pid: process.pid })}\n`,
)

const stop = (): void => {
  void server.stop(true).then(() => process.exit(0))
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)
