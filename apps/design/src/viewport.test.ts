import { describe, expect, it } from "@effect/vitest"
import { type Viewport, viewportOf } from "./viewport.ts"

describe("viewport", () => {
  it("is the widest breakpoint the window has reached", () => {
    const cases: ReadonlyArray<readonly [boolean, boolean, boolean, Viewport]> = [
      [false, false, false, "Phone"],
      [true, false, false, "Tablet"],
      [true, true, false, "Desktop"],
      [true, true, true, "Split"]
    ]
    for (const [isTablet, isDesktop, isSplit, viewport] of cases) {
      expect(viewportOf({ isTablet, isDesktop, isSplit })).toBe(viewport)
    }
  })
})
