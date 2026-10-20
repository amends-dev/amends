import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import {
  all,
  click,
  expect,
  expectAll,
  given,
  label,
  nth,
  role,
  scene,
  selector,
  submit,
  text,
  type,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button, field, iconButton, searchField, sending, submit as submitButton } from "./control.ts"
import { columns } from "./directory.ts"
import {
  pane,
  paneBack,
  paneClose,
  paneColumn,
  paneEmpty,
  paneForm,
  paneSection,
  paneStack,
  paneTabs,
  paneToolbar,
  paneToolbarStack
} from "./pane.ts"

const Tab = Schema.Literals(["threads", "tasks"])
type Tab = typeof Tab.Type

const Message = defineMessageUnion({
  ChangedTab: { tab: Tab },
  ClosedThread: {},
  WentBack: {},
  OpenedSettings: {},
  TypedName: { name: Schema.String },
  SubmittedName: {}
})
type Message = typeof Message.Type

type Model = Readonly<{
  tab: Tab
  closings: number
  backs: number
  settings: number
  name: string
  submissions: number
}>

const initial: Model = { tab: "threads", closings: 0, backs: 0, settings: 0, name: "", submissions: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ChangedTab: ({ tab }) => ({ model: modifyFields(model, { tab: () => tab }) }),
    ClosedThread: () => ({ model: modifyFields(model, { closings: (closings) => closings + 1 }) }),
    WentBack: () => ({ model: modifyFields(model, { backs: (backs) => backs + 1 }) }),
    OpenedSettings: () => ({ model: modifyFields(model, { settings: (settings) => settings + 1 }) }),
    TypedName: ({ name }) => ({ model: modifyFields(model, { name: () => name }) }),
    SubmittedName: () => ({ model: modifyFields(model, { submissions: (submissions) => submissions + 1 }) })
  })

const paneView = (render: (model: Model, h: HtmlBuilder<Message>) => Html) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Tab ${model.tab}, closed ${model.closings}, settings ${model.settings}`]),
      h.p([h.Role("note")], [`Back ${model.backs}`]),
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
      leading: paneBack(h, Message.WentBack()),
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
      expect(role("status")).toHaveText("Tab threads, closed 1, settings 0"),
      expect(role("note")).toHaveText("Back 0")
    )
  })

  it("goes back from the side pane with a button named Back, which is not Close", () => {
    scene(
      { update, view: paneView(sidePane) },
      given(initial),
      expect(within(role("complementary"), role("button", { name: "Back" }))).toExist(),
      click(role("button", { name: "Back" })),
      expect(role("note")).toHaveText("Back 1"),
      expect(role("status")).toHaveText("Tab threads, closed 0, settings 0")
    )
  })

  it("names where Back goes when it is told, as Back to Members, which does what Back does", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, {
            variant: "side",
            label: "Member details",
            header: {
              title: "Member details",
              leading: paneBack(h, Message.WentBack(), "Back to Members"),
              actions: [paneClose(h, Message.ClosedThread())]
            },
            body: []
          })
        )
      },
      given(initial),
      expect(role("button", { name: "Back" })).toBeAbsent(),
      click(role("button", { name: "Back to Members" })),
      expect(role("note")).toHaveText("Back 1")
    )
  })

  it("names what it closes when it is told, as Close task, which does what Close does", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, {
            variant: "side",
            label: "Composer paste crash",
            header: {
              title: "Composer paste crash",
              taskStatus: "progress",
              actions: [paneClose(h, Message.ClosedThread(), "Close task")]
            },
            body: []
          })
        )
      },
      given(initial),
      expect(role("button", { name: "Close" })).toBeAbsent(),
      click(role("button", { name: "Close task" })),
      expect(role("status")).toHaveText("Tab threads, closed 1, settings 0")
    )
  })

  it("puts the status of a task before the title, 1rem and hidden from assistive technology, and an icon takes its place", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, {
            variant: "side",
            label: "Composer paste crash",
            header: { title: "Composer paste crash", taskStatus: "progress", subtitle: "Task in #general" },
            body: []
          })
        )
      },
      given(initial),
      expect(within(role("complementary"), selector("svg"))).toHaveAttr("width", "1rem"),
      expect(within(role("complementary"), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("complementary"), selector("svg path[d^='M8 3.6']"))).toExist(),
      expect(within(role("complementary"), role("heading", { name: "Composer paste crash", level: 2 }))).toExist(),
      expect(within(role("complementary"), text("Task in #general"))).toExist()
    )
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, {
            variant: "side",
            label: "Composer paste crash",
            header: { title: "Composer paste crash", icon: "message", taskStatus: "done" },
            body: []
          })
        )
      },
      given(initial),
      expect(within(role("complementary"), selector("svg circle"))).toBeAbsent()
    )
  })

  it("has no Back in a pane that is given none", () => {
    scene({ update, view: paneView(mainPane) }, given(initial), expect(role("button", { name: "Back" })).toBeAbsent())
  })

  it("shows no subtitle beside tabs, and shows one when it has no tabs", () => {
    scene(
      {
        update,
        view: paneView((model, h) =>
          pane(h, {
            variant: "main",
            header: { title: "Yumi", mark: { text: "Y" }, subtitle: "Reads the repository.", tabs: tabs(model, h) },
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
            header: { title: "Yumi", mark: { text: "Y" }, subtitle: "Reads the repository." },
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

  it("puts the mark of what it is about before the title, in its tone, with its status as the patch and for assistive technology", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, {
            variant: "main",
            header: {
              title: "Yumi",
              mark: { text: "Y", tone: "lilac" },
              status: { kind: "attention", label: "Needs setup", detail: "Its model connection was removed." }
            },
            body: []
          })
        )
      },
      given(initial),
      expect(within(role("main"), text("Y"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("main"), text("Y"))).toHaveClass("size-6"),
      expect(within(role("main"), text("Y"))).not.toHaveAttr("title"),
      expect(within(role("main"), text("Y"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("main"), role("heading", { name: "Yumi", level: 1 }))).toExist(),
      expect(within(role("main"), selector(".sr-only"))).toHaveText("Needs setup"),
      expect(within(role("main"), selector(".text-caution-text"))).toHaveText("Needs setup"),
      expect(within(role("main"), text("Its model connection was removed."))).toExist(),
      expect(within(role("main"), selector(".tooltip-below"))).toHaveAttr("aria-hidden", "true")
    )
  })

  it("shows a mark without a status as the letters alone, and says no status for it", () => {
    scene(
      {
        update,
        view: paneView((_, h) => pane(h, { variant: "main", header: { title: "Yumi", mark: { text: "Y" } }, body: [] }))
      },
      given(initial),
      expect(within(role("main"), text("Y"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("main"), text("Y"))).not.toHaveAttr("title"),
      expect(within(role("main"), selector(".sr-only"))).toBeAbsent()
    )
  })

  it("shows a line under the title on phones only, stacking the title over it, and none unless it is given", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, {
            variant: "main",
            header: { title: "Yumi", phoneContext: "Mercier & Co", context: "Agent" },
            body: []
          })
        )
      },
      given(initial),
      expect(within(role("main"), text("Mercier & Co"))).toHaveClass("max-tablet:block"),
      expect(within(role("main"), text("Mercier & Co"))).toHaveClass("hidden"),
      expect(within(role("main"), text("Agent"))).not.toHaveClass("hidden"),
      expect(within(role("main"), selector("div.items-baseline"))).toHaveClass("max-tablet:flex-col")
    )
    scene(
      {
        update,
        view: paneView((_, h) => pane(h, { variant: "main", header: { title: "Yumi", context: "Agent" }, body: [] }))
      },
      given(initial),
      expect(within(role("main"), selector("div.items-baseline"))).not.toHaveClass("max-tablet:flex-col")
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

describe("paneEmpty", () => {
  const emptyPane = (copy?: string) => (_: Model, h: HtmlBuilder<Message>) =>
    pane(h, {
      variant: "main",
      header: { title: "Inbox" },
      body: [
        paneEmpty(h, {
          art: "rest",
          title: "You're all caught up",
          ...(copy === undefined ? {} : { copy })
        })
      ]
    })

  it("says its title as an h2 under the pane's h1, with its copy under it", () => {
    scene(
      { update, view: paneView(emptyPane("Nothing new.")) },
      given(initial),
      expect(within(role("main"), role("heading", { name: "Inbox", level: 1 }))).toExist(),
      expect(within(role("main"), role("heading", { name: "You're all caught up", level: 2 }))).toExist(),
      expect(within(role("main"), text("Nothing new."))).toExist()
    )
  })

  it("says its title as the screen's h1 with level 1, when its message is all the screen has", () => {
    scene(
      {
        update,
        view: paneView((_: Model, h: HtmlBuilder<Message>) =>
          paneEmpty(h, {
            art: "lost-thread",
            title: "Can't reach your workspace host",
            copy: "You're still signed in. Try again once the host is running.",
            level: 1
          })
        )
      },
      given(initial),
      expect(role("heading", { name: "Can't reach your workspace host", level: 1 })).toExist(),
      expect(role("heading", { level: 2 })).toBeAbsent(),
      expect(text("You're still signed in. Try again once the host is running.")).toExist()
    )
  })

  it("says each line of its copy as a paragraph of its own, in order", () => {
    scene(
      {
        update,
        view: paneView((_: Model, h: HtmlBuilder<Message>) =>
          paneEmpty(h, {
            art: "caret",
            title: "Welcome to #general",
            copy: ["You, Alex Morgan, and Sara are members.", "Send the first message to start the conversation."]
          })
        )
      },
      given(initial),
      expect(role("heading", { name: "Welcome to #general", level: 2 })).toExist(),
      expectAll(all.selector("p:not([role])")).toHaveCount(2),
      expect(nth(all.selector("p:not([role])"), 0)).toHaveText("You, Alex Morgan, and Sara are members."),
      expect(nth(all.selector("p:not([role])"), 1)).toHaveText("Send the first message to start the conversation.")
    )
  })

  it("shows no copy when it has none", () => {
    scene(
      { update, view: paneView(emptyPane()) },
      given(initial),
      expect(role("heading", { name: "You're all caught up", level: 2 })).toExist(),
      expect(selector("p:not([role])")).toBeAbsent()
    )
  })

  it("draws its art above the title, hidden from assistive technology", () => {
    scene(
      { update, view: paneView(emptyPane("Nothing new.")) },
      given(initial),
      expectAll(all.selector("svg")).toHaveCount(1),
      expect(selector("svg")).toHaveAttr("aria-hidden", "true"),
      expect(selector("svg")).toHaveAttr("viewBox", "0 0 64 64"),
      expect(selector("svg g.art-breathing")).toExist(),
      expect(role("img")).toBeAbsent(),
      expect(selector('div[role="status"]')).toBeAbsent()
    )
  })

  it("draws the art it is given, a different drawing for each kind", () => {
    scene(
      {
        update,
        view: paneView((_: Model, h: HtmlBuilder<Message>) =>
          paneEmpty(h, { art: "lost-thread", title: "Can't reach your workspace host", level: 1 })
        )
      },
      given(initial),
      expect(selector("svg")).toHaveAttr("viewBox", "0 0 120 64"),
      expect(selector("svg .art-recoiling-start")).toExist(),
      expect(selector("svg .art-recoiling-end")).toExist(),
      expect(selector("svg .art-breathing")).toBeAbsent()
    )
  })

  it("is a live region with the logo working when what it says is waited on", () => {
    scene(
      {
        update,
        view: paneView((_: Model, h: HtmlBuilder<Message>) =>
          paneEmpty(h, {
            art: "working",
            title: "Checking your session",
            copy: "Connecting to your workspace host…",
            level: 1
          })
        )
      },
      given(initial),
      expect(
        within(selector('div[role="status"]'), role("heading", { name: "Checking your session", level: 1 }))
      ).toExist(),
      expect(within(selector('div[role="status"]'), text("Connecting to your workspace host…"))).toExist(),
      expect(selector("svg")).toHaveAttr("viewBox", "0 0 64 64"),
      expect(selector("svg")).toHaveAttr("width", "3.5rem"),
      expect(selector("svg")).toHaveAttr("aria-hidden", "true"),
      expect(selector("svg.logo-working")).toExist()
    )
  })

  it("shows its action under the copy, and none without one", () => {
    scene(
      {
        update,
        view: paneView((_: Model, h: HtmlBuilder<Message>) =>
          pane(h, {
            variant: "main",
            header: { title: "Agents" },
            body: [
              paneEmpty(h, {
                art: "sew-in",
                title: "No agents yet",
                copy: "Add an agent.",
                action: button(h, "Add agent", Message.OpenedSettings(), { variant: "primary" })
              })
            ]
          })
        )
      },
      given(initial),
      expect(within(role("main"), role("button", { name: "Add agent" }))).toExist(),
      click(role("button", { name: "Add agent" })),
      expect(role("status")).toHaveText("Tab threads, closed 0, settings 1")
    )
    scene({ update, view: paneView(emptyPane("Nothing new.")) }, given(initial), expect(role("button")).toBeAbsent())
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

  const columnIn = (isWide: boolean) => (_: Model, h: HtmlBuilder<Message>) =>
    pane(h, {
      variant: "main",
      header: { title: "Threads" },
      body: [paneColumn(h, [h.p([], ["Composer paste crash"]), h.p([], ["Launch checklist"])], { isWide })]
    })

  it("keeps a measure of 42.5rem, for what is read and filled in", () => {
    scene(
      { update, view: paneView(columnIn(false)) },
      given(initial),
      expect(selector(".max-w-170")).toExist(),
      expect(within(selector(".max-w-170"), text("Composer paste crash"))).toExist(),
      expect(within(selector(".max-w-170"), text("Launch checklist"))).toExist()
    )
  })

  it("keeps the measure when it is given no options", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, { variant: "main", header: { title: "Settings" }, body: [paneColumn(h, [h.p([], ["Name"])])] })
        )
      },
      given(initial),
      expect(within(selector(".max-w-170"), text("Name"))).toExist()
    )
  })

  it("spans the pane when it is wide, for a list", () => {
    scene(
      { update, view: paneView(columnIn(true)) },
      given(initial),
      expect(selector(".max-w-170")).toBeAbsent(),
      expect(within(role("main"), text("Composer paste crash"))).toExist(),
      expect(within(role("main"), text("Launch checklist"))).toExist()
    )
  })
})

describe("paneStack", () => {
  it("holds what a side pane says about one thing, one under the other, 28px apart, with no measure", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          pane(h, {
            variant: "side",
            label: "Task",
            header: { title: "Composer paste crash" },
            body: [paneStack(h, [h.p([], ["Properties"]), h.p([], ["Description"]), h.p([], ["Activity"])])]
          })
        )
      },
      given(initial),
      expect(within(selector(".gap-7"), text("Properties"))).toExist(),
      expect(within(selector(".gap-7"), text("Description"))).toExist(),
      expect(within(selector(".gap-7"), text("Activity"))).toExist(),
      expect(selector(".gap-7")).toHaveClass("flex-col"),
      expect(selector(".max-w-170")).toBeAbsent()
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

  it("sets its title apart by a dashed rule to the pane's edge when it has a stitch, which assistive technology does not read", () => {
    scene(
      {
        update,
        view: paneView((_, h) =>
          paneColumn(h, [
            paneSection(h, {
              title: "Details",
              hasStitch: true,
              trailing: [sending(h, true)],
              children: [h.p([], ["Idle"])]
            }),
            paneSection(h, { title: "Turns", children: [h.p([], ["Scout"])] })
          ])
        )
      },
      given(initial),
      expect(within(role("region", { name: "Details" }), role("heading", { name: "Details", level: 3 }))).toExist(),
      expect(within(role("region", { name: "Details" }), text(" · Sending…"))).toExist(),
      expect(within(role("region", { name: "Details" }), selector("span.border-dashed"))).toHaveAttr(
        "aria-hidden",
        "true"
      ),
      expect(within(role("region", { name: "Turns" }), selector(".border-dashed"))).toBeAbsent()
    )
  })
})

describe("paneForm", () => {
  const formView =
    (render: (model: Model, h: HtmlBuilder<Message>) => Html) => (model: Model, h: HtmlBuilder<Message>) =>
      h.div([], [h.p([h.Role("status")], [`Submitted ${model.submissions}`]), render(model, h)])

  const renamePane = (model: Model, h: HtmlBuilder<Message>) =>
    paneColumn(h, [
      paneForm(h, { title: "Rename the workspace", onSubmit: Message.SubmittedName() }, [
        field(
          h,
          {
            id: "pane-form-name",
            label: "Name",
            type: "text",
            value: model.name,
            onInput: (name) => Message.TypedName({ name }),
            isAutofocus: false
          },
          Option.none()
        ),
        submitButton(h, "Save")
      ]),
      paneSection(h, { title: "Turns", children: [h.p([], ["Scout"])] })
    ])

  it("is a region and a form named by its title, an h3 over the form", () => {
    scene(
      { update, view: formView(renamePane) },
      given(initial),
      expect(role("region", { name: "Rename the workspace" })).toExist(),
      expect(
        within(
          role("region", { name: "Rename the workspace" }),
          role("heading", { name: "Rename the workspace", level: 3 })
        )
      ).toExist(),
      expect(
        within(role("region", { name: "Rename the workspace" }), role("form", { name: "Rename the workspace" }))
      ).toExist(),
      expect(within(role("form", { name: "Rename the workspace" }), label("Name"))).toExist(),
      expect(within(role("form", { name: "Rename the workspace" }), role("button", { name: "Save" }))).toExist()
    )
  })

  it("holds the fields it is given, and submitting it sends its message", () => {
    scene(
      { update, view: formView(renamePane) },
      given(initial),
      type(label("Name"), "Mercier"),
      expect(label("Name")).toHaveValue("Mercier"),
      submit(role("form", { name: "Rename the workspace" })),
      expect(role("status")).toHaveText("Submitted 1")
    )
  })

  it("sits among the other sections of the column, which are not forms", () => {
    scene(
      { update, view: formView(renamePane) },
      given(initial),
      expect(role("form")).toExist(),
      expect(within(role("region", { name: "Turns" }), role("form"))).toBeAbsent()
    )
  })

  it("takes the stitch of its section, and has none unless it is given", () => {
    scene(
      {
        update,
        view: formView((_, h) =>
          paneColumn(h, [
            paneForm(h, { title: "Setup", onSubmit: Message.SubmittedName(), hasStitch: true }, [h.p([], ["Fields"])]),
            paneForm(h, { title: "Rename", onSubmit: Message.SubmittedName() }, [h.p([], ["Name"])])
          ])
        )
      },
      given(initial),
      expect(within(role("region", { name: "Setup" }), selector(".border-dashed"))).toExist(),
      expect(within(role("region", { name: "Setup" }), role("form", { name: "Setup" }))).toExist(),
      expect(within(role("region", { name: "Rename" }), selector(".border-dashed"))).toBeAbsent()
    )
  })
})

describe("pane with a toolbar", () => {
  const listPane = (model: Model, h: HtmlBuilder<Message>) =>
    pane(h, {
      variant: "main",
      header: { title: "Members", icon: "users" },
      toolbar: [
        paneToolbar(h, {
          start: [
            searchField(h, {
              id: "member-search",
              label: "Search members",
              placeholder: "Search members…",
              value: model.name,
              onInput: (name) => Message.TypedName({ name })
            }),
            button(h, "Active members", Message.OpenedSettings())
          ],
          end: [button(h, "Invite people", Message.OpenedSettings())]
        }),
        columns(h, { label: "Member", cells: ["Role"] })
      ],
      body: [h.ul([h.AriaLabel("Members")], [h.li([], ["Ada Lovelace"])])]
    })

  const scrollingBody = selector("div.overflow-y-auto")

  it("holds the search, the filters, and the actions in a row under the header", () => {
    scene(
      { update, view: paneView(listPane) },
      given(initial),
      expect(label("Search members")).toHaveAttr("placeholder", "Search members…"),
      expect(role("button", { name: "Active members" })).toExist(),
      expect(role("button", { name: "Invite people" })).toExist(),
      type(label("Search members"), "ada"),
      expect(label("Search members")).toHaveValue("ada"),
      click(role("button", { name: "Invite people" })),
      expect(role("status")).toHaveText("Tab threads, closed 0, settings 1")
    )
  })

  it("keeps the toolbar and the column labels out of the body that scrolls, which starts flush under them", () => {
    scene(
      { update, view: paneView(listPane) },
      given(initial),
      expect(within(scrollingBody, text("Ada Lovelace"))).toExist(),
      expect(within(scrollingBody, label("Search members"))).toBeAbsent(),
      expect(within(scrollingBody, text("Member"))).toBeAbsent(),
      expect(scrollingBody).toHaveClass("pt-0"),
      expect(scrollingBody).not.toHaveClass("py-5")
    )
  })

  it("puts the actions at the end of the row, and at the start of the next line on a phone", () => {
    scene(
      { update, view: paneView(listPane) },
      given(initial),
      expect(selector("div.ms-auto")).toExist(),
      expect(within(selector("div.ms-auto"), role("button", { name: "Invite people" }))).toExist(),
      expect(within(selector("div.ms-auto"), role("button", { name: "Active members" }))).toBeAbsent(),
      expect(selector("div.ms-auto")).toHaveClass("max-tablet:ms-0")
    )
  })

  it("has no group of actions when it has none", () => {
    scene(
      {
        update,
        view: (_: Model, h: HtmlBuilder<Message>) =>
          paneToolbar(h, { start: [button(h, "Filter", Message.OpenedSettings())] })
      },
      given(initial),
      expect(role("button", { name: "Filter" })).toExist(),
      expect(selector("div.ms-auto")).toBeAbsent()
    )
  })

  it("keeps the pieces of a toolbar drawn by another view as one element, 12px apart", () => {
    scene(
      {
        update,
        view: (_: Model, h: HtmlBuilder<Message>) =>
          paneToolbarStack(h, [
            paneToolbar(h, { start: [button(h, "Filter", Message.OpenedSettings())] }),
            columns(h, { label: "Member", cells: ["Role"] })
          ])
      },
      given(initial),
      expect(selector("div.gap-3")).toHaveClass("flex-col"),
      expect(within(selector("div.gap-3"), role("button", { name: "Filter" }))).toExist(),
      expect(within(selector("div.gap-3"), text("Member"))).toExist()
    )
  })

  it("leaves a body without a toolbar its usual padding", () => {
    scene(
      { update, view: paneView(mainPane) },
      given(initial),
      expect(scrollingBody).toHaveClass("py-5"),
      expect(scrollingBody).not.toHaveClass("pt-0")
    )
  })
})
