import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { expect, given, role, scene, selector } from "foldkit/scene"
import { icon } from "./icon.ts"

const Message = defineMessageUnion({ Unused: {} })
type Message = typeof Message.Type

const update = (model: null, _message: Message): Update.Return<null, Message> => ({ model })

const iconView =
  (render: (h: HtmlBuilder<Message>) => ReadonlyArray<ReturnType<typeof icon>>) => (_: null, h: HtmlBuilder<Message>) =>
    h.div([], render(h))

describe("icon", () => {
  it("is decorative and hidden from assistive technology without a label", () => {
    scene(
      { update, view: iconView((h) => [icon(h, "mark-home")]) },
      given(null),
      expect(selector("svg")).toHaveAttr("aria-hidden", "true"),
      expect(role("img")).toBeAbsent()
    )
  })

  it("is an image named by its label, with a title", () => {
    scene(
      { update, view: iconView((h) => [icon(h, "alert-triangle", { label: "Needs attention" })]) },
      given(null),
      expect(role("img", { name: "Needs attention" })).toExist(),
      expect(selector("svg title")).toHaveText("Needs attention"),
      expect(selector("svg[aria-hidden]")).toBeAbsent()
    )
  })

  it("is decorative when its label is blank", () => {
    scene(
      { update, view: iconView((h) => [icon(h, "mark-home", { label: "  " })]) },
      given(null),
      expect(role("img")).toBeAbsent(),
      expect(selector("svg")).toHaveAttr("aria-hidden", "true")
    )
  })

  it("draws the catalog's path in the rendering contract's 24-unit box", () => {
    scene(
      { update, view: iconView((h) => [icon(h, "mark-home")]) },
      given(null),
      expect(selector("svg")).toHaveAttr("viewBox", "0 0 24 24"),
      expect(selector("svg")).toHaveAttr("stroke", "currentColor"),
      expect(selector("svg")).toHaveAttr("stroke-width", "2"),
      expect(selector("svg")).toHaveAttr("fill", "none"),
      expect(selector("path")).toHaveAttr("d", "M3 11L12 4L21 11M6 10L6 20L18 20L18 10")
    )
  })

  it("is 1.25rem unless it is given a size", () => {
    for (const [size, dimension] of [
      [undefined, "1.25rem"],
      ["xs", "0.75rem"],
      ["sm", "1rem"],
      ["md", "1.25rem"],
      ["lg", "1.5rem"]
    ] as const) {
      scene(
        { update, view: iconView((h) => [icon(h, "mark-home", size === undefined ? {} : { size })]) },
        given(null),
        expect(selector("svg")).toHaveAttr("width", dimension),
        expect(selector("svg")).toHaveAttr("height", dimension)
      )
    }
  })

  it("fills a filled icon's path and no other", () => {
    scene(
      { update, view: iconView((h) => [icon(h, "bell-filled")]) },
      given(null),
      expect(selector("path")).toHaveAttr("fill", "currentColor")
    )
    scene(
      { update, view: iconView((h) => [icon(h, "bell")]) },
      given(null),
      expect(selector("path")).not.toHaveAttr("fill")
    )
  })
})
