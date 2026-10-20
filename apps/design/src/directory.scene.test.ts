import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, nth, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button } from "./control.ts"
import { badge } from "./details.ts"
import {
  activityCell,
  cellWithDetail,
  columns,
  footnote,
  loadingRows,
  row,
  rowWithButton,
  section,
  summary
} from "./directory.ts"

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

  it("ends with the action it is given, after the line that runs to the edge", () => {
    scene(
      {
        update,
        view: viewOf((h) => [
          section(h, {
            label: "Pending invitations",
            count: 2,
            action: button(h, "View history", Message.ClickedMercier(), { variant: "quiet" })
          })
        ])
      },
      given(initial),
      expect(role("heading", { name: "Pending invitations", level: 2 })).toExist(),
      click(role("button", { name: "View history" })),
      expect(role("status")).toHaveText("Opened Mercier & Co")
    )
    scene(
      { update, view: viewOf((h) => [section(h, { label: "Invitations", count: 2 })]) },
      given(initial),
      expect(role("button")).toBeAbsent()
    )
  })
})

describe("row", () => {
  const rows = (h: HtmlBuilder<Message>) => [
    row(h, {
      mark: { text: "M" },
      title: "Mercier & Co",
      meta: "12 members · Owner",
      action: "Open →",
      onClick: Message.ClickedMercier()
    }),
    row(h, { mark: { text: "F" }, title: "Fieldwork", onClick: Message.ClickedFieldwork() })
  ]

  it("is one button named by its title and described by its meta, and clicking it sends its message", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(role("button", { name: "Mercier & Co" })).toHaveAttr("aria-description", "12 members · Owner"),
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
      expect(within(role("button", { name: "Mercier & Co" }), text("12 members · Owner"))).toExist(),
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

  it("carries the id it is given on its button, for focus to be moved to it, and none otherwise", () => {
    scene(
      {
        update,
        view: viewOf((h) => [
          row(h, { id: "workspace-1", mark: { text: "M" }, title: "Mercier & Co", onClick: Message.ClickedMercier() }),
          row(h, { mark: { text: "F" }, title: "Fieldwork", onClick: Message.ClickedFieldwork() })
        ])
      },
      given(initial),
      expect(role("button", { name: "Mercier & Co" })).toHaveAttr("id", "workspace-1"),
      expect(role("button", { name: "Fieldwork" })).not.toHaveAttr("id")
    )
  })
})

describe("rowWithButton", () => {
  const northstar = (h: HtmlBuilder<Message>) =>
    rowWithButton(h, {
      mark: { text: "N" },
      title: "Northstar Studio",
      meta: "Pending invitation · Expires in 7 days",
      action: "Accept invite",
      actionName: "Accept invite to Northstar Studio",
      onClick: Message.ClickedMercier()
    })

  const atlas = (h: HtmlBuilder<Message>) =>
    rowWithButton(h, {
      mark: { text: "A" },
      title: "Atlas Labs",
      action: "Accept invite",
      actionName: "Accept invite to Atlas Labs",
      onClick: Message.ClickedFieldwork()
    })

  const rows = (h: HtmlBuilder<Message>) => [northstar(h), atlas(h)]

  it("is not a button itself: its one button is at its end", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expectAll(all.role("button")).toHaveCount(2),
      expect(within(role("button", { name: "Accept invite to Northstar Studio" }), text("Accept invite"))).toExist(),
      expect(
        within(role("button", { name: "Accept invite to Northstar Studio" }), text("Northstar Studio"))
      ).toBeAbsent()
    )
  })

  it("names each button by its action and its title, so that the buttons of several rows are told apart", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toExist(),
      expect(role("button", { name: "Accept invite to Atlas Labs" })).toExist()
    )
  })

  it("shows its title and its meta as text beside the button, and its mark hidden from assistive technology", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(text("Northstar Studio")).toExist(),
      expect(text("Pending invitation · Expires in 7 days")).toExist(),
      expect(text("N")).toHaveAttr("aria-hidden", "true"),
      expect(text("Atlas Labs")).toExist()
    )
  })

  it("sends the message of the row whose button is clicked", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      click(role("button", { name: "Accept invite to Atlas Labs" })),
      click(role("button", { name: "Accept invite to Northstar Studio" })),
      expect(role("status")).toHaveText("Opened Fieldwork, Mercier & Co")
    )
  })

  it("has a secondary button, and no hover or pointer of its own, since the row is not what is pressed", () => {
    const only = (h: HtmlBuilder<Message>) => [northstar(h)]

    scene(
      { update, view: viewOf(only) },
      given(initial),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toHaveClass("border-outline"),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toHaveClass("bg-action-secondary"),
      expect(selector("div.min-h-19")).not.toHaveClass("hover:bg-hover"),
      expect(selector("div.min-h-19")).not.toHaveClass("cursor-pointer")
    )
  })
})

describe("rowWithButton as a pending invitation's", () => {
  const casey = (h: HtmlBuilder<Message>) =>
    rowWithButton(h, {
      mark: { icon: "mark-mail" },
      markSize: "md",
      title: "casey@mercier.example",
      meta: "Member · Expires in 5 days",
      action: "Revoke",
      actionName: "Revoke invitation for casey@mercier.example",
      variant: "quiet",
      onClick: Message.ClickedFieldwork()
    })

  it("draws an icon in a 32px mark, hidden from assistive technology, and keeps its title and meta as text", () => {
    scene(
      { update, view: viewOf((h) => [casey(h)]) },
      given(initial),
      expect(selector("span.relative.size-8 svg")).toExist(),
      expect(selector("span.relative.size-8")).toHaveAttr("aria-hidden", "true"),
      expect(text("casey@mercier.example")).toExist(),
      expect(text("Member · Expires in 5 days")).toExist()
    )
  })

  it("has a quiet button named for the invitation, in place of the secondary one", () => {
    scene(
      { update, view: viewOf((h) => [casey(h)]) },
      given(initial),
      expect(role("button", { name: "Revoke invitation for casey@mercier.example" })).toHaveText("Revoke"),
      expect(role("button", { name: "Revoke invitation for casey@mercier.example" })).toHaveClass("bg-transparent"),
      expect(role("button", { name: "Revoke invitation for casey@mercier.example" })).not.toHaveClass(
        "bg-action-secondary"
      ),
      click(role("button", { name: "Revoke invitation for casey@mercier.example" })),
      expect(role("status")).toHaveText("Opened Fieldwork")
    )
  })

  it("disables its button while the invitation is itself on its way, and not otherwise", () => {
    scene(
      { update, view: viewOf((h) => [casey(h)]) },
      given(initial),
      expect(role("button", { name: "Revoke invitation for casey@mercier.example" })).toBeEnabled()
    )
    scene(
      {
        update,
        view: viewOf((h) => [
          rowWithButton(h, {
            mark: { icon: "mark-mail" },
            markSize: "md",
            title: "casey@mercier.example",
            action: "Revoke",
            actionName: "Revoke invitation for casey@mercier.example",
            variant: "quiet",
            isDisabled: true,
            onClick: Message.ClickedFieldwork()
          })
        ])
      },
      given(initial),
      expect(role("button", { name: "Revoke invitation for casey@mercier.example" })).toBeDisabled()
    )
  })

  it("is as tall as its mark makes it, 76px with a 32px mark and 56px with a 24px one", () => {
    scene({ update, view: viewOf((h) => [casey(h)]) }, given(initial), expect(selector("div.min-h-19")).toExist())
    scene(
      {
        update,
        view: viewOf((h) => [
          rowWithButton(h, {
            mark: { text: "N" },
            markSize: "sm",
            title: "Nora",
            action: "Remove",
            actionName: "Remove Nora",
            onClick: Message.ClickedMercier()
          })
        ])
      },
      given(initial),
      expect(selector("div.min-h-14")).toExist(),
      expect(role("button", { name: "Remove Nora" })).toHaveClass("bg-action-secondary")
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

describe("footnote", () => {
  it("says what else the person can do, in quiet text 24px under the list before it", () => {
    scene(
      {
        update,
        view: viewOf((h) => [footnote(h, "Accept an invitation above, or create your own workspace.")])
      },
      given(initial),
      expect(text("Accept an invitation above, or create your own workspace.")).toHaveClass("mt-6"),
      expect(text("Accept an invitation above, or create your own workspace.")).toHaveClass("text-ink-secondary")
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
      mark: { text: "#" },
      title: "design",
      cells: [badge(h, { label: "Public" }), h.span([], ["12 members"])],
      cellsText: "Public · 12 members",
      action: "Open →",
      onClick: Message.ClickedMercier()
    }),
    row(h, {
      mark: { text: "#" },
      title: "product",
      meta: "Design reviews",
      cells: [badge(h, { label: "Private" })],
      cellsText: "Private",
      onClick: Message.ClickedFieldwork()
    }),
    row(h, { mark: { text: "N" }, title: "Northstar", action: "Open →", onClick: Message.ClickedFieldwork() })
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

describe("row with a status", () => {
  const needsSetup = { kind: "attention", label: "Needs setup", detail: "Its model connection was removed." } as const

  const rows = (h: HtmlBuilder<Message>) => [
    row(h, {
      mark: { text: "R", tone: "lilac" },
      markSize: "md",
      status: needsSetup,
      title: "Review helper",
      cells: [cellWithDetail(h, { value: "Auto", detail: "No sandbox" })],
      cellsText: "Auto · No sandbox",
      onClick: Message.ClickedMercier()
    }),
    row(h, { mark: { text: "N", tone: "lilac" }, markSize: "md", title: "Nora", onClick: Message.ClickedFieldwork() })
  ]

  const reviewHelper = role("button", { name: "Review helper, Needs setup" })

  it("is named by its title and then its status's word, and described by its cells' words", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(reviewHelper).toHaveAttr("aria-description", "Auto · No sandbox"),
      expect(role("button", { name: "Nora" })).toExist(),
      click(reviewHelper),
      expect(role("status")).toHaveText("Opened Mercier & Co")
    )
  })

  it("puts the patch on its mark, which shows the word and the reason on hover and is hidden from assistive technology", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(reviewHelper, text("R"))).toHaveAttr("title", "Needs setup: Its model connection was removed."),
      expect(within(reviewHelper, text("R"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Nora" }), text("N"))).not.toHaveAttr("title")
    )
  })

  it("draws its mark at 32px in the tone it is given, or 40px and neutral unless told", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(reviewHelper, text("R"))).toHaveClass("size-8"),
      expect(within(reviewHelper, text("R"))).toHaveClass("bg-avatar-lilac-bg")
    )
    scene(
      {
        update,
        view: viewOf((h) => [row(h, { mark: { text: "G" }, title: "Group", onClick: Message.ClickedMercier() })])
      },
      given(initial),
      expect(within(role("button", { name: "Group" }), text("G"))).toHaveClass("size-10"),
      expect(within(role("button", { name: "Group" }), text("G"))).toHaveClass("bg-avatar-neutral-bg")
    )
  })

  it("is cut out of its own surface while it is hovered, and starts the folded cells under its 32px mark", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(reviewHelper).toHaveClass("hover:[--amends-status-knockout:var(--amends-hover)]"),
      expect(within(reviewHelper, selector(".contents"))).toHaveClass("max-tablet:ps-12")
    )
  })
})

describe("compact row", () => {
  const rows = (h: HtmlBuilder<Message>) => [
    row(h, {
      mark: { text: "JM" },
      markSize: "sm",
      title: "Jamie Morgan · You",
      cells: [h.span([], ["Owner"]), h.span([], ["Active"])],
      cellsText: "Owner · Active",
      isCurrent: true,
      onClick: Message.ClickedMercier()
    }),
    row(h, {
      mark: { text: "Y", tone: "lilac" },
      markSize: "sm",
      title: "Yumi",
      meta: "Agent",
      cells: [h.span([], ["Member"]), h.span([], ["Active"])],
      cellsText: "Member · Active",
      onClick: Message.ClickedFieldwork()
    })
  ]

  it("draws a 24px mark in a row 56px tall, and starts the folded cells 40px in", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(role("button", { name: "Yumi" }), text("Y"))).toHaveClass("size-6"),
      expect(role("button", { name: "Yumi" })).toHaveClass("min-h-14"),
      expect(role("button", { name: "Yumi" })).not.toHaveClass("min-h-19"),
      expect(within(role("button", { name: "Yumi" }), selector(".contents"))).toHaveClass("max-tablet:ps-10")
    )
  })

  it("keeps the 76px of a roomier row for its 32px and 40px marks", () => {
    scene(
      {
        update,
        view: viewOf((h) => [
          row(h, { mark: { text: "A" }, markSize: "md", title: "Atlas", onClick: Message.ClickedMercier() }),
          row(h, { mark: { text: "M" }, title: "Mercier", onClick: Message.ClickedFieldwork() })
        ])
      },
      given(initial),
      expect(role("button", { name: "Atlas" })).toHaveClass("min-h-19"),
      expect(role("button", { name: "Mercier" })).toHaveClass("min-h-19")
    )
  })

  it("marks the row whose details are open as current, filled and with the bar, and no other", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(role("button", { name: "Jamie Morgan · You" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Jamie Morgan · You" })).toHaveClass("aria-[current=true]:bg-selected"),
      expect(role("button", { name: "Jamie Morgan · You" })).toHaveClass("aria-[current=true]:indicator-bar"),
      expect(role("button", { name: "Jamie Morgan · You" })).toHaveClass("relative"),
      expect(role("button", { name: "Yumi" })).not.toHaveAttr("aria-current")
    )
  })
})

describe("row with an icon for a mark", () => {
  const rows = (h: HtmlBuilder<Message>) => [
    row(h, {
      mark: { icon: "mark-connections" },
      markSize: "md",
      status: { kind: "attention", label: "Needs setup", detail: "The key is missing." },
      title: "Search tools",
      meta: "MCP server · Tools",
      cells: [h.span([], ["API key"])],
      cellsText: "API key",
      onClick: Message.ClickedMercier()
    }),
    row(h, {
      mark: { icon: "mark-connections" },
      markSize: "md",
      title: "Local models",
      meta: "Anthropic · Models",
      onClick: Message.ClickedFieldwork()
    })
  ]

  it("draws the drawing in the square where letters would be, with the patch on its corner", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(role("button", { name: "Search tools, Needs setup" }), selector("span.relative svg"))).toExist(),
      expect(within(role("button", { name: "Search tools, Needs setup" }), selector("span.relative"))).toHaveAttr(
        "title",
        "Needs setup: The key is missing."
      ),
      expect(within(role("button", { name: "Local models" }), selector("span.relative svg"))).toExist(),
      expect(within(role("button", { name: "Local models" }), selector("span.relative"))).not.toHaveAttr("title")
    )
  })

  it("is named by its title and described by its meta and its cells' words, as any row is", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(role("button", { name: "Search tools, Needs setup" })).toHaveAttr(
        "aria-description",
        "MCP server · Tools · API key"
      ),
      click(role("button", { name: "Local models" })),
      expect(role("status")).toHaveText("Opened Fieldwork")
    )
  })
})

describe("cells of two lines", () => {
  const rows = (h: HtmlBuilder<Message>) => [
    row(h, {
      mark: { text: "A", tone: "lilac" },
      title: "Atlas",
      cells: [
        cellWithDetail(h, { value: "Claude Code", detail: "Remote development" }),
        cellWithDetail(h, { value: "Claude Sonnet 5" }),
        activityCell(h, { state: "Working", place: "#design" })
      ],
      cellsText: "Claude Code · Remote development · Claude Sonnet 5 · Working · #design",
      onClick: Message.ClickedMercier()
    })
  ]

  it("show a value over a quieter detail, and the logo's mark before the state of what is at work", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(text("Claude Code")).toExist(),
      expect(text("Remote development")).toHaveClass("text-ink-secondary"),
      expect(text("Claude Sonnet 5")).toExist(),
      expect(text("Working")).toExist(),
      expect(text("#design")).toHaveClass("text-ink-secondary"),
      expect(within(role("button", { name: "Atlas" }), selector("svg[aria-hidden]"))).toExist(),
      expect(within(role("button", { name: "Atlas" }), selector("svg.logo-working"))).toExist()
    )
  })

  it("keep only the value below 48rem, where the cells fold under the title", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(text("Remote development")).toHaveClass("max-tablet:hidden"),
      expect(text("#design")).toHaveClass("max-tablet:hidden"),
      expect(text("Claude Code")).not.toHaveClass("max-tablet:hidden")
    )
  })
})

describe("loadingRows", () => {
  it("says what is loading in a live region that only assistive technology reads", () => {
    scene(
      { update, view: viewOf((h) => [loadingRows(h, { label: "Loading agents…" })]) },
      given(initial),
      expect(selector("p.sr-only")).toHaveText("Loading agents…"),
      expect(selector("p.sr-only")).toHaveAttr("role", "status")
    )
  })

  it("stands in with three rows unless given a count, hidden from assistive technology", () => {
    scene(
      { update, view: viewOf((h) => [loadingRows(h, { label: "Loading agents…" })]) },
      given(initial),
      expect(selector("ul")).toHaveAttr("aria-hidden", "true"),
      expectAll(all.selector("ul li")).toHaveCount(3)
    )
    scene(
      { update, view: viewOf((h) => [loadingRows(h, { label: "Loading workspaces…", count: 2 })]) },
      given(initial),
      expectAll(all.selector("ul li")).toHaveCount(2)
    )
  })

  it("draws each row as a square where the mark goes and a long and a short bar where the text goes", () => {
    scene(
      { update, view: viewOf((h) => [loadingRows(h, { label: "Loading agents…", count: 1 })]) },
      given(initial),
      expectAll(all.selector("li .bg-subtle")).toHaveCount(3),
      expect(nth(all.selector("li .bg-subtle"), 0)).toHaveClass("flex-none"),
      expect(nth(all.selector("li .bg-subtle"), 1)).toHaveClass("w-[min(16rem,60%)]"),
      expect(nth(all.selector("li .bg-subtle"), 2)).toHaveClass("w-[min(9rem,35%)]")
    )
  })

  it("takes the shape of a row of the same mark size: 40px marks unless given, and 32px and 24px", () => {
    scene(
      { update, view: viewOf((h) => [loadingRows(h, { label: "Loading…", count: 1 })]) },
      given(initial),
      expect(nth(all.selector("li .bg-subtle"), 0)).toHaveClass("size-10"),
      expect(selector("li")).toHaveClass("min-h-19")
    )
    scene(
      { update, view: viewOf((h) => [loadingRows(h, { label: "Loading…", count: 1, markSize: "md" })]) },
      given(initial),
      expect(nth(all.selector("li .bg-subtle"), 0)).toHaveClass("size-8"),
      expect(selector("li")).toHaveClass("min-h-19")
    )
    scene(
      { update, view: viewOf((h) => [loadingRows(h, { label: "Loading…", count: 1, markSize: "sm" })]) },
      given(initial),
      expect(nth(all.selector("li .bg-subtle"), 0)).toHaveClass("size-6"),
      expect(selector("li")).toHaveClass("min-h-14")
    )
  })

  it("dims and brightens slowly, as the pulse the reader accepts motion for", () => {
    scene(
      { update, view: viewOf((h) => [loadingRows(h, { label: "Loading agents…", count: 1 })]) },
      given(initial),
      expect(selector("li")).toHaveClass("loading-pulse")
    )
  })
})
