import { expect, test } from "bun:test"
import { z } from "zod"

const EvidenceSchema = z.object({
  setupControls: z.object({
    confirmedStartCommand: z.string(),
  }),
})

test("documents the dedicated Serve upstream instead of the direct broker port", async () => {
  const evidence = EvidenceSchema.parse(
    await Bun.file(
      new URL(
        "../../../../../evidence/task-9-opencode-remote-dispatch-plugin.json",
        import.meta.url,
      ),
    ).json(),
  )

  expect(evidence.setupControls.confirmedStartCommand).toBe(
    "tailscale serve --bg --accept-app-caps=opencode-dispatch-plugin/cap/control 43111",
  )
})
