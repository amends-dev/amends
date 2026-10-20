import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, expect, expectAll, given, nth, role, scene, selector } from "foldkit/scene"
import { type StateArtKind, stateArt, stateArtKinds } from "./stateArt.ts"

const Message = defineMessageUnion({ Unused: {} })
type Message = typeof Message.Type

const update = (model: null, _message: Message): Update.Return<null, Message> => ({ model })

const artView = (render: (h: HtmlBuilder<Message>) => ReadonlyArray<Html>) => (_: null, h: HtmlBuilder<Message>) =>
  h.div([], render(h))

/** What each kind draws beyond the mark's parts, by the class of the part that moves. */
const movingParts: Readonly<Record<StateArtKind, ReadonlyArray<string>>> = {
  "sew-in": ["g.art-sewing-in"],
  reach: ["path.art-reaching"],
  fill: ["rect.art-filling"],
  caret: ["path.art-caret"],
  rest: ["g.art-breathing"],
  "came-apart": ["g.art-swinging", "path.art-fraying", "path.art-fraying-late"],
  "lost-thread": ["path.art-recoiling-start", "path.art-recoiling-end"],
  "nothing-here": ["path.art-scanning"],
  "held-back": ["g.art-pulling", "path.art-tautening"]
}

describe("stateArt", () => {
  it("has nine kinds", () => {
    scene(
      { update, view: artView((h) => stateArtKinds.map((kind) => stateArt(h, kind))) },
      given(null),
      expectAll(all.selector("svg")).toHaveCount(9)
    )
  })

  for (const kind of stateArtKinds) {
    it(`draws ${kind}, decorative and hidden from assistive technology`, () => {
      scene(
        { update, view: artView((h) => [stateArt(h, kind)]) },
        given(null),
        expectAll(all.selector("svg")).toHaveCount(1),
        expect(selector("svg")).toHaveAttr("aria-hidden", "true"),
        expect(role("img")).toBeAbsent(),
        expect(selector("svg")).toHaveClass("h-18"),
        ...movingParts[kind].map((part) => expect(selector(`svg ${part}`)).toExist())
      )
    })
  }

  for (const kind of ["sew-in", "reach", "lost-thread"] as const) {
    it(`draws ${kind} on 120 units across, for the two pieces and the thread between them`, () => {
      scene(
        { update, view: artView((h) => [stateArt(h, kind)]) },
        given(null),
        expect(selector("svg")).toHaveAttr("viewBox", "0 0 120 64")
      )
    })
  }

  for (const kind of ["fill", "caret", "rest", "came-apart", "nothing-here", "held-back"] as const) {
    it(`draws ${kind} on 64 units across`, () => {
      scene(
        { update, view: artView((h) => [stateArt(h, kind)]) },
        given(null),
        expect(selector("svg")).toHaveAttr("viewBox", "0 0 64 64")
      )
    })
  }

  it("draws the mark's parts for rest, came-apart, and held-back: the square, the patch, and the stitches", () => {
    scene(
      { update, view: artView((h) => [stateArt(h, "rest")]) },
      given(null),
      expect(nth(all.selector("svg rect"), 0)).toHaveAttr("width", "42"),
      expect(nth(all.selector("svg rect"), 1)).toHaveAttr("width", "39"),
      expectAll(all.selector("svg path")).toHaveCount(4)
    )
    scene(
      { update, view: artView((h) => [stateArt(h, "held-back")]) },
      given(null),
      expect(nth(all.selector("svg rect"), 1)).toHaveAttr("x", "22"),
      expectAll(all.selector("svg path")).toHaveCount(4)
    )
  })

  it("leaves two stitches in place and frays the other two when it came apart", () => {
    scene(
      { update, view: artView((h) => [stateArt(h, "came-apart")]) },
      given(null),
      expectAll(all.selector("svg path")).toHaveCount(4),
      expect(nth(all.selector("svg path"), 0)).toHaveAttr("d", "M30 18.5 V25.5"),
      expect(nth(all.selector("svg path"), 2)).toHaveAttr("d", "M18.5 30 H22")
    )
  })

  it("outlines the places that wait to be filled, in dashes", () => {
    scene(
      { update, view: artView((h) => [stateArt(h, "sew-in")]) },
      given(null),
      expect(nth(all.selector("svg rect"), 0)).toHaveClass("[stroke-dasharray:6_5]"),
      expect(nth(all.selector("svg rect"), 1)).toHaveClass("[stroke-dasharray:6_5]"),
      expect(nth(all.selector("svg rect"), 2)).toHaveClass("fill-current")
    )
  })
})
