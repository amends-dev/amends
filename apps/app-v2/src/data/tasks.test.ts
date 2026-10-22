import { describe, expect, it } from "@effect/vitest"
import { isOpen } from "./tasks.ts"

describe("isOpen", () => {
  it("is true for a task that is not done or dismissed, and false for one that is", () => {
    expect((["triage", "todo", "doing", "held"] as const).map(isOpen)).toEqual([true, true, true, true])
    expect((["done", "dismissed"] as const).map(isOpen)).toEqual([false, false])
  })
})
