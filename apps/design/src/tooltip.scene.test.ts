import { describe, it } from "@effect/vitest"
import type { HtmlBuilder } from "foldkit/html"
import { expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { mark } from "./mark.ts"
import { tooltip } from "./tooltip.ts"

const still = { update: (model: null) => ({ model }) }

describe("tooltip", () => {
  it("holds what it is over and the popover beside it, hidden from assistive technology, with no title of its own", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div(
            [h.Id("row")],
            [
              tooltip(h, {
                title: "Needs setup",
                detail: "Its model connection was removed.",
                children: [mark(h, { text: "R" })]
              })
            ]
          )
      },
      given(null),
      expect(within(selector("#row"), text("R"))).toExist(),
      expect(within(selector("#row .invisible"), text("Needs setup"))).toExist(),
      expect(within(selector("#row .invisible"), text("Its model connection was removed."))).toExist(),
      expect(selector("#row .invisible")).toHaveAttr("aria-hidden", "true"),
      expect(within(selector("#row"), selector("[title]"))).toBeAbsent(),
      expect(role("tooltip")).toBeAbsent()
    )
  })

  it("is a span around its children, so it can sit inside a link without changing the link's name or the layout of what it holds", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.a([h.Href("/agents/atlas")], [tooltip(h, { title: "Online", children: [mark(h, { text: "A" })] }), "Atlas"])
      },
      given(null),
      expect(role("link", { name: "Atlas" })).toExist(),
      expect(within(role("link", { name: "Atlas" }), selector(".tooltip-anchor"))).toHaveClass("relative"),
      expect(within(role("link", { name: "Atlas" }), selector(".tooltip-anchor"))).toHaveClass("inline-flex"),
      expect(within(role("link", { name: "Atlas" }), selector(".tooltip-anchor"))).toHaveClass("flex-none"),
      expect(within(role("link", { name: "Atlas" }), selector(".tooltip-anchor"))).toHaveClass("group/tooltip")
    )
  })

  it("shows over what the pointer rests on after 300ms, or what has keyboard focus, and hides at once", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          tooltip(h, { title: "Follow", children: [h.button([h.Type("button")], ["Follow"])] })
      },
      given(null),
      expect(selector(".invisible")).toHaveClass("group-hover/tooltip:visible"),
      expect(selector(".invisible")).toHaveClass("group-hover/tooltip:delay-300"),
      expect(selector(".invisible")).toHaveClass("group-has-focus-visible/tooltip:visible"),
      expect(selector(".invisible")).toHaveClass("duration-0"),
      expect(selector(".invisible")).toHaveClass("pointer-events-none")
    )
  })

  it("is above its children by default, 280px wide at most, and below them when they have no room above", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div(
            [],
            [
              h.div([h.Id("above")], [tooltip(h, { title: "Offline", children: [mark(h, { text: "O" })] })]),
              h.div(
                [h.Id("below")],
                [tooltip(h, { title: "Online", placement: "below", children: [mark(h, { text: "N" })] })]
              )
            ]
          )
      },
      given(null),
      expect(selector("#above .invisible")).toHaveClass("tooltip-above"),
      expect(selector("#above .invisible")).not.toHaveClass("tooltip-below"),
      expect(selector("#above .invisible")).toHaveClass("max-w-70"),
      expect(selector("#below .invisible")).toHaveClass("tooltip-below"),
      expect(selector("#below .invisible")).not.toHaveClass("tooltip-above")
    )
  })

  it("colors the title by its tone, plain without one, and puts the detail under it in quieter text", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          h.div(
            [],
            [
              tooltip(h, { title: "Offline", detail: "Quiet since Monday.", children: [mark(h, { text: "O" })] }),
              tooltip(h, { title: "Online", tone: "success", children: [mark(h, { text: "N" })] }),
              tooltip(h, { title: "Needs setup", tone: "caution", children: [mark(h, { text: "S" })] }),
              tooltip(h, { title: "Unavailable", tone: "danger", children: [mark(h, { text: "U" })] })
            ]
          )
      },
      given(null),
      expect(text("Offline")).toHaveClass("text-ink"),
      expect(text("Offline")).toHaveClass("font-medium"),
      expect(text("Quiet since Monday.")).toHaveClass("text-ink-secondary"),
      expect(text("Online")).toHaveClass("text-success-text"),
      expect(text("Needs setup")).toHaveClass("text-caution-text"),
      expect(text("Unavailable")).toHaveClass("text-danger-text")
    )
  })

  it("has no line for a detail when it is given none", () => {
    scene(
      {
        ...still,
        view: (_: null, h: HtmlBuilder<never>) =>
          tooltip(h, { title: "Needs setup", tone: "caution", children: [mark(h, { text: "S" })] })
      },
      given(null),
      expect(within(selector(".invisible"), selector(".text-ink-secondary"))).toBeAbsent(),
      expect(within(selector(".invisible"), text("Needs setup"))).toExist()
    )
  })
})
