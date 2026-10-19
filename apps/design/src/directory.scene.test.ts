import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { row, section } from "./directory.ts"

const Message = defineMessageUnion({ ClickedMercier: {}, ClickedFieldwork: {} })
type Message = typeof Message.Type

type Model = Readonly<{ opened: ReadonlyArray<string> }>

const initial: Model = { opened: [] }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedMercier: () => ({ model: modifyFields(model, { opened: (opened) => [...opened, "Mercier & Co"] }) }),
    ClickedFieldwork: () => ({ model: modifyFields(model, { opened: (opened) => [...opened, "Fieldwork"] }) })
  })

const viewOf = (render: (h: HtmlBuilder<Message>) => ReadonlyArray<Html>) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div([], [h.p([h.Role("status")], [`Opened ${model.opened.join(", ")}`]), ...render(h)])

describe("section", () => {
  it("is a heading with how many it holds", () => {
    scene(
      { update, view: viewOf((h) => [section(h, { label: "Your workspaces", count: 2 })]) },
      given(initial),
      expect(role("heading", { name: "Your workspaces", level: 2 })).toExist(),
      expect(text("2")).toExist()
    )
  })

  it("is a heading alone when it has no count", () => {
    scene(
      { update, view: viewOf((h) => [section(h, { label: "Invitations" })]) },
      given(initial),
      expect(role("heading", { name: "Invitations" })).toExist()
    )
  })
})

describe("row", () => {
  const rows = (h: HtmlBuilder<Message>) => [
    row(h, {
      mark: "M",
      title: "Mercier & Co",
      meta: "12 members · as Alex",
      action: "Open →",
      onClick: Message.ClickedMercier()
    }),
    row(h, { mark: "F", title: "Fieldwork", onClick: Message.ClickedFieldwork() })
  ]

  it("is one button named by its title and described by its meta, and clicking it sends its message", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(role("button", { name: "Mercier & Co" })).toHaveAttr("aria-description", "12 members · as Alex"),
      expect(role("button", { name: "Fieldwork" })).toExist(),
      click(role("button", { name: "Mercier & Co" })),
      click(role("button", { name: "Fieldwork" })),
      expect(role("status")).toHaveText("Opened Mercier & Co, Fieldwork")
    )
  })

  it("shows its mark, its meta, and its action inside the button", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(role("button", { name: "Mercier & Co" }), text("M"))).toExist(),
      expect(within(role("button", { name: "Mercier & Co" }), text("12 members · as Alex"))).toExist(),
      expect(within(role("button", { name: "Mercier & Co" }), text("Open →"))).toExist()
    )
  })
})
