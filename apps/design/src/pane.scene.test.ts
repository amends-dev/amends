import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { iconButton, sending } from "./control.ts"
import { pane, paneClose, paneColumn, paneSection, paneTabs } from "./pane.ts"

const Tab = Schema.Literals(["threads", "tasks"])
type Tab = typeof Tab.Type

const Message = defineMessageUnion({ ChangedTab: { tab: Tab }, ClosedThread: {}, OpenedSettings: {} })
type Message = typeof Message.Type

type Model = Readonly<{ tab: Tab; closings: number; settings: number }>

const initial: Model = { tab: "threads", closings: 0, settings: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ChangedTab: ({ tab }) => ({ model: modifyFields(model, { tab: () => tab }) }),
    ClosedThread: () => ({ model: modifyFields(model, { closings: (closings) => closings + 1 }) }),
    OpenedSettings: () => ({ model: modifyFields(model, { settings: (settings) => settings + 1 }) })
  })

const paneView = (render: (model: Model, h: HtmlBuilder<Message>) => Html) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Tab ${model.tab}, closed ${model.closings}, settings ${model.settings}`]),
      render(model, h)
    ]
  )

const tabs = (model: Model, h: HtmlBuilder<Message>) =>
  paneTabs(h, {
    label: "Group",
    tabs: [
      { label: "Threads", isCurrent: model.tab === "threads", onClick: Message.ChangedTab({ tab: "threads" }) },
      { label: "Tasks", count: 12, isCurrent: model.tab === "tasks", onClick: Message.ChangedTab({ tab: "tasks" }) }
    ]
  })

const mainPane = (model: Model, h: HtmlBuilder<Message>) =>
  pane(h, {
    variant: "main",
    header: {
      title: "general",
      icon: "mark-channel",
      context: "Mercier & Co",
      actions: [iconButton(h, { icon: "mark-settings", label: "Group settings", onClick: Message.OpenedSettings() })],
      tabs: tabs(model, h)
    },
    body: [h.p([], ["The preview is ready for another look."])],
    footer: [h.p([], ["Message #general"])]
  })

const sidePane = (_: Model, h: HtmlBuilder<Message>) =>
  pane(h, {
    variant: "side",
    label: "Composer paste crash",
    header: {
      title: "Composer paste crash",
      icon: "message",
      subtitle: "Thread in #general",
      actions: [paneClose(h, Message.ClosedThread())]
    },
    body: [h.p([], ["found a bug."])],
    footer: [h.p([], ["Reply in thread"])]
  })

describe("pane", () => {
  it("is the page's main landmark in its main variant, titled by an h1", () => {
    scene(
      { update, view: paneView(mainPane) },
      given(initial),
      expect(role("main")).toExist(),
      expect(within(role("main"), role("heading", { name: "general", level: 1 }))).toExist(),
      expect(within(role("main"), text("Mercier & Co"))).toExist()
    )
  })

  it("holds its header's actions, its body, and its footer", () => {
    scene(
      { update, view: paneView(mainPane) },
      given(initial),
      click(within(role("main"), role("button", { name: "Group settings" }))),
      expect(role("status")).toHaveText("Tab threads, closed 0, settings 1"),
      expect(within(role("main"), text("The preview is ready for another look."))).toExist(),
      expect(within(role("main"), text("Message #general"))).toExist()
    )
  })

  it("is a complementary landmark named by its label in its side variant, titled by an h2", () => {
    scene(
      { update, view: paneView(sidePane) },
      given(initial),
      expect(role("complementary", { name: "Composer paste crash" })).toExist(),
      expect(role("main")).toBeAbsent(),
      expect(
        within(
          role("complementary", { name: "Composer paste crash" }),
          role("heading", { name: "Composer paste crash", level: 2 })
        )
      ).toExist(),
      expect(within(role("complementary", { name: "Composer paste crash" }), text("Thread in #general"))).toExist()
    )
  })

  it("closes the side pane with a button named Close", () => {
    scene(
      { update, view: paneView(sidePane) },
      given(initial),
      click(role("button", { name: "Close" })),
      expect(role("status")).toHaveText("Tab threads, closed 1, settings 0")
    )
  })

  it("shows no subtitle beside tabs, and shows one when it has no tabs", () => {
    scene(
      {
        update,
        view: paneView((model, h) =>
          pane(h, {
            variant: "main",
            header: { title: "Yumi", mark: "Y", subtitle: "Reads the repository.", tabs: tabs(model, h) },
            body: []
          })
        )
      },
      given(initial),
      expect(text("Reads the repository.")).toBeAbsent(),
      expect(role("tablist", { name: "Group" })).toExist()
    )
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, {
            variant: "main",
            header: { title: "Yumi", mark: "Y", subtitle: "Reads the repository." },
            body: []
          })
        )
      },
      given(initial),
      expect(text("Reads the repository.")).toExist(),
      expect(role("tablist")).toBeAbsent()
    )
  })

  it("puts a leading control before the title", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, {
            variant: "main",
            header: {
              title: "general",
              leading: iconButton(h, { icon: "mark-menu", label: "Open navigation", onClick: Message.OpenedSettings() })
            },
            body: []
          })
        )
      },
      given(initial),
      click(role("button", { name: "Open navigation" })),
      expect(role("status")).toHaveText("Tab threads, closed 0, settings 1")
    )
  })
})

describe("paneTabs", () => {
  it("is a tablist named by its label with a tab for each, and the current one aria-selected", () => {
    scene(
      { update, view: paneView(mainPane) },
      given(initial),
      expect(role("tablist", { name: "Group" })).toExist(),
      expect(role("tab", { name: "Threads" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-selected", "false"),
      expect(role("tab", { name: "Tasks", selected: false })).toExist()
    )
  })

  it("selects the tab that was clicked", () => {
    scene(
      { update, view: paneView(mainPane) },
      given(initial),
      click(role("tab", { name: "Tasks" })),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "Threads" })).toHaveAttr("aria-selected", "false"),
      expect(role("status")).toHaveText("Tab tasks, closed 0, settings 0")
    )
  })

  it("shows a count after the label and describes the tab by it", () => {
    scene(
      { update, view: paneView(mainPane) },
      given(initial),
      expect(within(role("tab", { name: "Tasks" }), text("12"))).toExist(),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-description", "12"),
      expect(role("tab", { name: "Threads" })).not.toHaveAttr("aria-description")
    )
  })
})

describe("paneColumn", () => {
  it("holds a page's sections in the pane's body", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, {
            variant: "main",
            header: { title: "Yumi" },
            body: [paneColumn(h, [h.p([], ["Model"]), h.p([], ["Tools"])])]
          })
        )
      },
      given(initial),
      expect(within(role("main"), text("Model"))).toExist(),
      expect(within(role("main"), text("Tools"))).toExist()
    )
  })
})

describe("paneSection", () => {
  it("is a region named by its title, an h3, with its trailing pieces after the title and its children below", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          paneColumn(h, [
            paneSection(h, {
              title: "Task",
              trailing: [sending(h, true)],
              children: [h.p([], ["Triage"]), h.p([], ["No one"])]
            }),
            paneSection(h, { title: "Turns", children: [h.p([], ["Scout"])] })
          ])
        )
      },
      given(initial),
      expect(role("region", { name: "Task" })).toExist(),
      expect(within(role("region", { name: "Task" }), role("heading", { name: "Task", level: 3 }))).toExist(),
      expect(within(role("region", { name: "Task" }), text(" · Sending…"))).toExist(),
      expect(within(role("region", { name: "Task" }), text("Triage"))).toExist(),
      expect(within(role("region", { name: "Task" }), text("No one"))).toExist(),
      expect(within(role("region", { name: "Turns" }), text("Scout"))).toExist(),
      expect(within(role("region", { name: "Turns" }), text(/Sending/))).toBeAbsent(),
      expect(within(role("region", { name: "Turns" }), text("Triage"))).toBeAbsent()
    )
  })
})
