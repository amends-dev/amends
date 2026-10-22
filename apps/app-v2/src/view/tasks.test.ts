import { describe, expect, it } from "@effect/vitest"
import { statusShape } from "./tasks.ts"

describe("statusShape", () => {
  it("draws the four statuses apps/ui has as it does, and a pause for held and a cross for dismissed", () => {
    expect(
      (["triage", "todo", "doing", "held", "done", "dismissed"] as const).map((status) => statusShape[status])
    ).toEqual(["triage", "open", "progress", "paused", "done", "dismissed"])
  })
})
