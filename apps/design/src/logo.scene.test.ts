import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, nth, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { logo, logoMotions } from "./logo.ts"

const Message = defineMessageUnion({ ClickedHome: {} })
type Message = typeof Message.Type

type Model = Readonly<{ visits: number }>

const initial: Model = { visits: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedHome: () => ({ model: modifyFields(model, { visits: (visits) => visits + 1 }) })
  })

const logoView = (render: (h: HtmlBuilder<Message>) => ReadonlyArray<Html>) => (_: Model, h: HtmlBuilder<Message>) =>
  h.div([], render(h))

describe("logo", () => {
  it("is decorative and hidden from assistive technology without a label", () => {
    scene(
      { update, view: logoView((h) => [logo(h)]) },
      given(initial),
      expect(selector("svg")).toHaveAttr("aria-hidden", "true"),
      expect(role("img")).toBeAbsent()
    )
  })

  it("is an image named by its label", () => {
    scene(
      { update, view: logoView((h) => [logo(h, { label: "amends" })]) },
      given(initial),
      expect(role("img", { name: "amends" })).toExist(),
      expect(selector("svg[aria-hidden]")).toBeAbsent()
    )
  })

  it("is decorative when its label is blank", () => {
    scene(
      { update, view: logoView((h) => [logo(h, { label: "  " })]) },
      given(initial),
      expect(role("img")).toBeAbsent(),
      expect(selector("svg")).toHaveAttr("aria-hidden", "true")
    )
  })

  it("is drawn on a 64-unit grid: a square, a patch over its corner, and four stitches across the seam", () => {
    scene(
      { update, view: logoView((h) => [logo(h)]) },
      given(initial),
      expect(selector("svg")).toHaveAttr("viewBox", "0 0 64 64"),
      expectAll(all.selector("svg rect")).toHaveCount(2),
      expect(nth(all.selector("svg rect"), 0)).toHaveAttr("width", "42"),
      expect(nth(all.selector("svg rect"), 1)).toHaveAttr("x", "22"),
      expect(nth(all.selector("svg rect"), 1)).toHaveClass("logo-patch"),
      expectAll(all.selector("svg path.logo-stitch")).toHaveCount(4),
      expect(nth(all.selector("svg path"), 0)).toHaveAttr("d", "M18.5 37 H25.5"),
      expect(nth(all.selector("svg path"), 3)).toHaveAttr("d", "M37 18.5 V25.5")
    )
  })

  it("takes the color of the text around it and is cut out of the surface behind it", () => {
    scene(
      { update, view: logoView((h) => [logo(h)]) },
      given(initial),
      expect(nth(all.selector("svg rect"), 0)).toHaveClass("fill-current"),
      expect(nth(all.selector("svg rect"), 1)).toHaveClass("fill-current"),
      expect(nth(all.selector("svg rect"), 1)).toHaveClass("stroke-status-knockout"),
      expect(nth(all.selector("svg path"), 0)).toHaveClass("stroke-status-knockout")
    )
  })

  it("is 1.25rem unless given a size, which can be any CSS length", () => {
    scene(
      { update, view: logoView((h) => [logo(h), logo(h, { size: "3.5rem" })]) },
      given(initial),
      expect(nth(all.selector("svg"), 0)).toHaveAttr("width", "1.25rem"),
      expect(nth(all.selector("svg"), 0)).toHaveAttr("height", "1.25rem"),
      expect(nth(all.selector("svg"), 1)).toHaveAttr("width", "3.5rem"),
      expect(nth(all.selector("svg"), 1)).toHaveAttr("height", "3.5rem")
    )
  })

  it("is still without a motion", () => {
    scene(
      { update, view: logoView((h) => [logo(h)]) },
      given(initial),
      ...logoMotions.map((motion) => expect(selector("svg")).not.toHaveClass(`logo-${motion}`))
    )
  })

  for (const motion of logoMotions) {
    it(`loops its ${motion} motion by the class that motion is written under`, () => {
      scene(
        { update, view: logoView((h) => [logo(h, { motion })]) },
        given(initial),
        expect(selector("svg")).toHaveClass(`logo-${motion}`),
        ...logoMotions
          .filter((other) => other !== motion)
          .map((other) => expect(selector("svg")).not.toHaveClass(`logo-${other}`))
      )
    })
  }

  it("lifts its patch in a link or a button that is hovered, with its parts written for that hover", () => {
    scene(
      {
        update,
        view: logoView((h) => [
          h.a([h.Href("#home"), h.AriaLabel("Amends home")], [logo(h)]),
          h.button([h.OnClick(Message.ClickedHome())], [logo(h, { motion: "working" }), "Home"])
        ])
      },
      given(initial),
      expect(within(role("link", { name: "Amends home" }), selector("rect.logo-patch"))).toExist(),
      expect(within(role("link", { name: "Amends home" }), selector("path.logo-stitch"))).toExist(),
      click(role("button", { name: "Home" })),
      expect(within(role("button", { name: "Home" }), text("Home"))).toExist()
    )
  })
})
