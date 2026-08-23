import { TimelineItemSchema } from "@opencode-dispatch/contracts"
import { cleanup, render } from "@solidjs/testing-library"
import { For } from "solid-js"
import { afterEach, expect, test } from "vitest"

import { TimelineEntry } from "../../src/features/sessions/pages"

afterEach(() => cleanup())

test("renders authoritative transcript parts in server order", () => {
  const timeline = [
    TimelineItemSchema.parse({
      type: "user_message",
      messageId: "msg-user",
      text: "Start the verification.",
      createdAt: 1_754_352_000_000,
    }),
    TimelineItemSchema.parse({
      type: "assistant_reasoning",
      messageId: "msg-assistant",
      partId: "part-reasoning",
      text: "Checking the current state.",
      phase: "complete",
    }),
    TimelineItemSchema.parse({
      type: "assistant_text",
      messageId: "msg-assistant",
      partId: "part-text",
      text: "Verification complete.",
      phase: "streaming",
    }),
    TimelineItemSchema.parse({
      type: "tool",
      messageId: "msg-assistant",
      partId: "part-tool",
      callId: "call-test",
      name: "test",
      state: { status: "completed", title: "Tests", output: "4 pass" },
    }),
  ]

  const rendered = render(() => (
    <section aria-label="Session transcript">
      <For each={timeline}>{(item) => <TimelineEntry item={item} />}</For>
    </section>
  ))

  const transcript = rendered.getByRole("region", { name: "Session transcript" })
  const content = transcript.textContent ?? ""
  const positions = [
    content.indexOf("Start the verification."),
    content.indexOf("Checking the current state."),
    content.indexOf("Verification complete."),
    content.indexOf("test: completed"),
    content.indexOf("4 pass"),
  ]
  expect(positions.every((position) => position >= 0)).toBe(true)
  expect(positions).toEqual([...positions].sort((left, right) => left - right))
  expect(rendered.container.querySelector('[data-state="streaming"]')?.textContent).toContain(
    "Verification complete.",
  )
})
