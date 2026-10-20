import { describe, expect, it, vi } from "@effect/vitest"
import { Runtime } from "foldkit"
import { ApplicationComposition } from "./composition.ts"
import { crashView } from "./crash.ts"

describe("the entry", () => {
  it("assembles the application with the crash view, and runs it", async () => {
    document.body.innerHTML = '<div id="root"></div>'
    const assemble = vi.spyOn(ApplicationComposition, "assembleApplication")
    const run = vi.spyOn(Runtime, "run").mockImplementation(() => undefined)

    await import("./entry.ts")

    expect(assemble).toHaveBeenCalledOnce()
    expect(assemble.mock.calls[0]?.[0]).toMatchObject({ crash: { view: crashView } })
    expect(run).toHaveBeenCalledOnce()
  })
})
