import { z } from "zod"

import type { FakeOpenCodeScenario } from "./open-code-state.ts"

const SessionStatusSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("idle") }),
  z.strictObject({ type: z.literal("busy") }),
  z.strictObject({
    type: z.literal("retry"),
    attempt: z.number().int().nonnegative(),
    message: z.string(),
    next: z.number(),
  }),
])

const SessionStatusEventSchema = z.strictObject({
  id: z.string().min(1),
  type: z.literal("session.status"),
  properties: z.strictObject({
    sessionID: z.string().min(1),
    status: SessionStatusSchema,
  }),
})

const TodoUpdatedEventSchema = z.strictObject({
  id: z.string().min(1),
  type: z.literal("todo.updated"),
  properties: z.strictObject({
    sessionID: z.string().min(1),
    todos: z.array(
      z.strictObject({
        content: z.string(),
        status: z.string(),
        priority: z.string(),
      }),
    ),
  }),
})

const PermissionAskedEventSchema = z.strictObject({
  id: z.string().min(1),
  type: z.literal("permission.v2.asked"),
  properties: z.strictObject({
    id: z.string().min(1),
    sessionID: z.string().min(1),
    action: z.string().min(1),
    resources: z.array(z.string()),
  }),
})

const QuestionAskedEventSchema = z.strictObject({
  id: z.string().min(1),
  type: z.literal("question.v2.asked"),
  properties: z.strictObject({
    id: z.string().min(1),
    sessionID: z.string().min(1),
    questions: z.array(
      z.strictObject({
        header: z.string(),
        question: z.string(),
        options: z.array(z.strictObject({ label: z.string(), description: z.string() })),
      }),
    ),
  }),
})

export const OpenCodeFixtureEventSchema = z.discriminatedUnion("type", [
  SessionStatusEventSchema,
  TodoUpdatedEventSchema,
  PermissionAskedEventSchema,
  QuestionAskedEventSchema,
])
export type OpenCodeFixtureEvent = z.infer<typeof OpenCodeFixtureEventSchema>
export type OpenCodeEventFault = "dropped" | "malformed" | "reordered"

const EVENT_SEQUENCES = {
  dropped: [1, 3],
  reordered: [2, 1],
} as const satisfies Record<Exclude<OpenCodeEventFault, "malformed">, readonly number[]>

export class OpenCodeFixtureProtocolError extends Error {
  override readonly name = "OpenCodeFixtureProtocolError"

  constructor(
    readonly code: "malformed_event" | "reordered_event" | "sequence_gap" | "stream_rejected",
  ) {
    super(`OpenCode fixture event stream failed with ${code}.`)
  }
}

function fixtureEvent(scenario: FakeOpenCodeScenario, id: string): OpenCodeFixtureEvent {
  return {
    id,
    type: "session.status",
    properties: { sessionID: scenario.sessionId, status: scenario.status },
  }
}

export function createOpenCodeEventStream(
  scenario: FakeOpenCodeScenario,
  fault?: OpenCodeEventFault,
): string {
  if (fault === "malformed") {
    return "id: 1\nevent: opencode\ndata: {\n\n"
  }
  const sequences = fault === undefined ? [1] : EVENT_SEQUENCES[fault]
  return sequences
    .map(
      (sequence) =>
        `id: ${sequence}\nevent: opencode\ndata: ${JSON.stringify(fixtureEvent(scenario, `event-${sequence}`))}\n\n`,
    )
    .join("")
}

function parseEventFrame(frame: string): {
  readonly sequence: number
  readonly event: OpenCodeFixtureEvent
} {
  const lines = frame.split("\n")
  const idLine = lines.find((line) => line.startsWith("id: "))
  const dataLine = lines.find((line) => line.startsWith("data: "))
  if (idLine === undefined || dataLine === undefined) {
    throw new OpenCodeFixtureProtocolError("malformed_event")
  }
  const sequence = Number(idLine.slice(4))
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new OpenCodeFixtureProtocolError("malformed_event")
  }
  let rawEvent: unknown
  try {
    rawEvent = JSON.parse(dataLine.slice(6))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new OpenCodeFixtureProtocolError("malformed_event")
    }
    throw error
  }
  const parsed = OpenCodeFixtureEventSchema.safeParse(rawEvent)
  if (!parsed.success) {
    throw new OpenCodeFixtureProtocolError("malformed_event")
  }
  return { sequence, event: parsed.data }
}

export async function readOpenCodeEvents(url: URL): Promise<readonly OpenCodeFixtureEvent[]> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new OpenCodeFixtureProtocolError("stream_rejected")
  }
  const frames = (await response.text()).split("\n\n").filter((frame) => frame.length > 0)
  const events: OpenCodeFixtureEvent[] = []
  let previousSequence = -1
  for (const frame of frames) {
    const parsed = parseEventFrame(frame)
    if (parsed.sequence <= previousSequence) {
      throw new OpenCodeFixtureProtocolError("reordered_event")
    }
    if (previousSequence >= 0 && parsed.sequence !== previousSequence + 1) {
      throw new OpenCodeFixtureProtocolError("sequence_gap")
    }
    previousSequence = parsed.sequence
    events.push(parsed.event)
  }
  return events
}
