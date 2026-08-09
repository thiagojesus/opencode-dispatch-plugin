import { z } from "zod"

import { assertNever, LoopbackServerUrlSchema } from "../../packages/contracts/src/index.ts"
import {
  createOpenCodeEventStream,
  type OpenCodeEventFault,
  OpenCodeFixtureProtocolError,
  readOpenCodeEvents,
} from "./open-code-events.ts"
import {
  createOpenCodeScenario,
  type FakeOpenCodeScenario,
  type OpenCodeCompatibility,
} from "./open-code-state.ts"

const PromptAsyncBodySchema = z.strictObject({
  parts: z.array(z.strictObject({ type: z.literal("text"), text: z.string().min(1) })).min(1),
})
const PermissionReplyBodySchema = z.strictObject({
  reply: z.enum(["once", "always", "reject"]),
  message: z.string().optional(),
})
const QuestionReplyBodySchema = z.strictObject({
  answers: z.array(z.array(z.string().min(1)).min(1)).min(1),
})

type OpenCodeOperation =
  | "health"
  | "status"
  | "session"
  | "messages"
  | "todo"
  | "prompt_async"
  | "abort"
  | "permissions"
  | "permission_reply"
  | "questions"
  | "question_reply"
  | "events"

export type ObservedOpenCodeRequest =
  | { readonly operation: "prompt_async"; readonly text: string }
  | { readonly operation: "abort" }
  | { readonly operation: "permission_reply"; readonly reply: "once" | "always" | "reject" }
  | { readonly operation: "question_reply"; readonly answers: readonly (readonly string[])[] }

export type OpenCodeFixtureRoutes = {
  readonly health: string
  readonly status: string
  readonly session: string
  readonly messages: string
  readonly todo: string
  readonly promptAsync: string
  readonly abort: string
  readonly permissions: string
  readonly permissionReply: string
  readonly questions: string
  readonly questionReply: string
  readonly events: string
}

export type OpenCodeFixture = {
  readonly origin: string
  readonly routes: OpenCodeFixtureRoutes
  readonly scenario: FakeOpenCodeScenario
  requests(): readonly ObservedOpenCodeRequest[]
  stop(): Promise<void>
}

export type OpenCodeFixtureOptions = {
  readonly compatibility: OpenCodeCompatibility
  readonly eventFault?: OpenCodeEventFault
}

function createRoutes(
  compatibility: OpenCodeCompatibility,
  scenario: FakeOpenCodeScenario,
): OpenCodeFixtureRoutes {
  const legacySession = `/session/${scenario.sessionId}`
  const apiSession = `/api/session/${scenario.sessionId}`
  switch (compatibility) {
    case "1.18.3":
    case "latest-compatible":
      return {
        health: "/global/health",
        status: "/session/status",
        session: legacySession,
        messages: `${legacySession}/message`,
        todo: `${legacySession}/todo`,
        promptAsync: `${legacySession}/prompt_async`,
        abort: `${legacySession}/abort`,
        permissions: `${apiSession}/permission`,
        permissionReply: `${apiSession}/permission/${scenario.permissionRequestId}/reply`,
        questions: `${apiSession}/question`,
        questionReply: `${apiSession}/question/${scenario.questionRequestId}/reply`,
        events: "/api/event",
      }
    default:
      return assertNever(compatibility)
  }
}

function matchOperation(request: Request, routes: OpenCodeFixtureRoutes): OpenCodeOperation | null {
  const pathname = new URL(request.url).pathname
  const key = `${request.method} ${pathname}`
  const operations = new Map<string, OpenCodeOperation>([
    [`GET ${routes.health}`, "health"],
    [`GET ${routes.status}`, "status"],
    [`GET ${routes.session}`, "session"],
    [`GET ${routes.messages}`, "messages"],
    [`GET ${routes.todo}`, "todo"],
    [`POST ${routes.promptAsync}`, "prompt_async"],
    [`POST ${routes.abort}`, "abort"],
    [`GET ${routes.permissions}`, "permissions"],
    [`POST ${routes.permissionReply}`, "permission_reply"],
    [`GET ${routes.questions}`, "questions"],
    [`POST ${routes.questionReply}`, "question_reply"],
    [`GET ${routes.events}`, "events"],
  ])
  return operations.get(key) ?? null
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | null> {
  if (request.headers.get("content-type") !== "application/json") {
    return null
  }
  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null
    }
    throw error
  }
  const parsed = schema.safeParse(body)
  return parsed.success ? parsed.data : null
}

export async function startOpenCodeFixture(
  options: OpenCodeFixtureOptions,
): Promise<OpenCodeFixture> {
  const scenario = createOpenCodeScenario(options.compatibility)
  const routes = createRoutes(options.compatibility, scenario)
  const requests: ObservedOpenCodeRequest[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const operation = matchOperation(request, routes)
      if (operation === null) {
        return Response.json({ error: "fixture_route_not_found" }, { status: 404 })
      }
      switch (operation) {
        case "health":
          return Response.json({ healthy: true, version: options.compatibility })
        case "status":
          return Response.json({ [scenario.sessionId]: scenario.status })
        case "session":
          return Response.json(scenario.session)
        case "messages":
          return Response.json(scenario.messages)
        case "todo":
          return Response.json(scenario.todos)
        case "permissions":
          return Response.json({ data: scenario.permissions })
        case "questions":
          return Response.json({ data: scenario.questions })
        case "events":
          return new Response(createOpenCodeEventStream(scenario, options.eventFault), {
            headers: { "content-type": "text/event-stream" },
          })
        case "prompt_async": {
          const body = await parseBody(request, PromptAsyncBodySchema)
          if (body === null) {
            return Response.json({ error: "fixture_request_invalid" }, { status: 400 })
          }
          const firstPart = body.parts[0]
          if (firstPart === undefined) {
            return Response.json({ error: "fixture_request_invalid" }, { status: 400 })
          }
          requests.push({ operation, text: firstPart.text })
          return new Response(null, { status: 204 })
        }
        case "abort":
          requests.push({ operation })
          return Response.json(true)
        case "permission_reply": {
          const body = await parseBody(request, PermissionReplyBodySchema)
          if (body === null) {
            return Response.json({ error: "fixture_request_invalid" }, { status: 400 })
          }
          requests.push({ operation, reply: body.reply })
          return new Response(null, { status: 204 })
        }
        case "question_reply": {
          const body = await parseBody(request, QuestionReplyBodySchema)
          if (body === null) {
            return Response.json({ error: "fixture_request_invalid" }, { status: 400 })
          }
          requests.push({ operation, answers: body.answers })
          return new Response(null, { status: 204 })
        }
        default:
          return assertNever(operation)
      }
    },
  })

  return {
    origin: LoopbackServerUrlSchema.parse(server.url.origin),
    routes,
    scenario,
    requests: () => requests.slice(),
    stop: () => server.stop(true),
  }
}

export type { OpenCodeCompatibility } from "./open-code-state.ts"
export { OpenCodeFixtureProtocolError, readOpenCodeEvents }
