import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { badge } from "./details.ts"
import { columns, row, section, summary } from "./directory.ts"

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

  it("keeps no room at its end for cells or an action it lacks", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(role("button", { name: "Fieldwork" }), selector("span[aria-hidden]"))).toHaveText("F")
    )
  })
})

describe("summary", () => {
  it("says what a list holds, with how many at its end", () => {
    scene(
      { update, view: viewOf((h) => [summary(h, { copy: "Public groups you can join.", count: "4 groups" })]) },
      given(initial),
      expect(text("Public groups you can join.")).toExist(),
      expect(text("4 groups")).toExist()
    )
  })
})

describe("columns", () => {
  const view = viewOf((h) => [columns(h, { label: "Group", cells: ["Visibility", "Members"] })])

  it("labels the mark and title column and each cell column, hidden from assistive technology", () => {
    scene(
      { update, view },
      given(initial),
      expect(within(selector('[aria-hidden="true"]'), text("Group"))).toExist(),
      expect(within(selector('[aria-hidden="true"]'), text("Visibility"))).toExist(),
      expect(within(selector('[aria-hidden="true"]'), text("Members"))).toExist(),
      expect(text("Group")).toHaveClass("flex-1"),
      expect(text("Members")).toHaveClass("w-32")
    )
  })

  it("narrows its cell columns and the room for an action with a row's, below 64rem", () => {
    scene(
      { update, view },
      given(initial),
      expect(text("Visibility")).toHaveClass("max-desktop:w-24"),
      expect(text("Members")).toHaveClass("max-desktop:w-24"),
      expect(within(selector('[aria-hidden="true"]'), selector("span.w-24"))).toHaveClass("max-desktop:w-20")
    )
  })

  it("is not shown below 48rem, where a row's cells fold under its title", () => {
    scene({ update, view }, given(initial), expect(selector('[aria-hidden="true"]')).toHaveClass("max-tablet:hidden"))
  })
})

describe("row with cells", () => {
  const rows = (h: HtmlBuilder<Message>) => [
    row(h, {
      mark: "#",
      title: "design",
      cells: [badge(h, { label: "Public" }), h.span([], ["12 members"])],
      cellsText: "Public · 12 members",
      action: "Open →",
      onClick: Message.ClickedMercier()
    }),
    row(h, {
      mark: "#",
      title: "product",
      meta: "Design reviews",
      cells: [badge(h, { label: "Private" })],
      cellsText: "Private",
      onClick: Message.ClickedFieldwork()
    }),
    row(h, { mark: "N", title: "Northstar", action: "Open →", onClick: Message.ClickedFieldwork() })
  ]

  it("shows its cells and its action inside the button, which its cells' words describe", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(role("button", { name: "design" })).toHaveAttr("aria-description", "Public · 12 members"),
      expect(within(role("button", { name: "design" }), text("Public"))).toExist(),
      expect(within(role("button", { name: "design" }), text("12 members"))).toExist(),
      expect(within(role("button", { name: "design" }), text("Open →"))).toExist()
    )
  })

  it("is described by its meta, then its cells' words", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(role("button", { name: "product" })).toHaveAttr("aria-description", "Design reviews · Private")
    )
  })

  const cellsOf = (title: string) => within(role("button", { name: title }), selector(".contents"))

  const firstCellOf = (title: string) => within(role("button", { name: title }), selector("span.w-32"))

  it("keeps its cells in one element hidden from assistive technology, each in a column of its own", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(cellsOf("design")).toHaveAttr("aria-hidden", "true"),
      expect(cellsOf("design")).toHaveText("Public12 members"),
      expect(firstCellOf("design")).toHaveClass("w-32")
    )
  })

  it("narrows its columns and the room for its action below 64rem", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(firstCellOf("design")).toHaveClass("max-desktop:w-24"),
      expect(within(role("button", { name: "design" }), text("Open →"))).toHaveClass("max-desktop:w-20")
    )
  })

  it("keeps the room for an action it lacks, and none for a row without cells", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(role("button", { name: "design" }), text("Open →"))).toHaveClass("w-24"),
      expect(within(role("button", { name: "product" }), selector("span.w-24"))).toExist(),
      expect(within(role("button", { name: "Northstar" }), text("Open →"))).not.toHaveClass("w-24")
    )
  })

  it("folds below 48rem: its cells wrap under the title on a line of their own, as wide as each is", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(role("button", { name: "design" })).toHaveClass("max-tablet:flex-wrap"),
      expect(cellsOf("design")).toHaveClass("max-tablet:basis-full"),
      expect(cellsOf("design")).toHaveClass("max-tablet:flex-wrap"),
      expect(cellsOf("design")).toHaveClass("max-tablet:gap-2"),
      expect(firstCellOf("design")).toHaveClass("max-tablet:w-auto")
    )
  })

  it("does not show its action below 48rem, with or without one", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(role("button", { name: "design" }), text("Open →"))).toHaveClass("max-tablet:hidden"),
      expect(within(role("button", { name: "product" }), selector("span.w-24"))).toHaveClass("max-tablet:hidden")
    )
  })

  it("does not fold a row without cells, which keeps its action", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(role("button", { name: "Northstar" })).not.toHaveClass("max-tablet:flex-wrap"),
      expect(cellsOf("Northstar")).toBeAbsent(),
      expect(within(role("button", { name: "Northstar" }), text("Open →"))).not.toHaveClass("max-tablet:hidden")
    )
  })

  it("sends its message when clicked, like any row", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      click(role("button", { name: "design" })),
      expect(role("status")).toHaveText("Opened Mercier & Co")
    )
  })
})
