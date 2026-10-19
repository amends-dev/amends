import { describe, it } from "@effect/vitest"
import type { HtmlBuilder } from "foldkit/html"
import { expect, given, role, scene, text } from "foldkit/scene"
import { mark } from "./mark.ts"

const marks = (_: null, h: HtmlBuilder<never>) =>
  h.div(
    [],
    [
      h.p([], ["Alex Morgan"]),
      mark(h, { text: "AM", size: "xs" }),
      mark(h, { text: "S" }),
      mark(h, { text: "Y", size: "md" })
    ]
  )

describe("mark", () => {
  it("shows its letters at each size, hidden from assistive technology", () => {
    scene(
      { update: (model: null) => ({ model }), view: marks },
      given(null),
      expect(text("AM")).toHaveAttr("aria-hidden", "true"),
      expect(text("S")).toHaveAttr("aria-hidden", "true"),
      expect(text("Y")).toHaveAttr("aria-hidden", "true"),
      expect(role("img")).toBeAbsent(),
      expect(text("Alex Morgan")).toExist()
    )
  })
})
