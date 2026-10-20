import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, nth, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button, buttonRow, hint, sending } from "./control.ts"
import {
  activityList,
  badge,
  detailList,
  entry,
  entryList,
  person,
  properties,
  property,
  propertyIcon,
  propertyValue,
  turnActivity,
  turnStatus
} from "./details.ts"
import { taskStatus } from "./mark.ts"

const Message = defineMessageUnion({ ClickedStop: {}, ClickedOpen: {} })
type Message = typeof Message.Type

type Model = Readonly<{ stops: number; opens: number }>

const initial: Model = { stops: 0, opens: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedStop: () => ({ model: modifyFields(model, { stops: (stops) => stops + 1 }) }),
    ClickedOpen: () => ({ model: modifyFields(model, { opens: (opens) => opens + 1 }) })
  })

const viewOf = (render: (h: HtmlBuilder<Message>) => Html) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div([], [h.p([h.Role("status")], [`Stopped ${model.stops}, opened ${model.opens}`]), render(h)])

describe("detailList", () => {
  it("is a definition list with a label before each value, a value being text or any Html", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          detailList(h, [
            { label: "Status", value: "Triage" },
            { label: "Priority", value: "No priority" },
            { label: "Thread", value: button(h, "Open thread", Message.ClickedOpen(), { variant: "link" }) }
          ])
        )
      },
      given(initial),
      expect(selector("dl")).toExist(),
      expect(within(selector("dl"), text("Status"))).toExist(),
      expect(within(selector("dl"), text("Triage"))).toExist(),
      expect(within(selector("dl"), text("Priority"))).toExist(),
      expect(within(selector("dl"), text("No priority"))).toExist(),
      expect(within(selector("dl"), text("Thread"))).toExist(),
      expect(selector("dt")).toHaveText("Status"),
      expect(selector("dd")).toHaveText("Triage"),
      click(within(selector("dl"), role("button", { name: "Open thread" }))),
      expect(role("status")).toHaveText("Stopped 0, opened 1")
    )
  })
})

describe("properties", () => {
  const read = (h: HtmlBuilder<Message>) =>
    properties(h, {
      label: "Task",
      children: [
        property(h, {
          caption: "Status",
          children: [propertyValue(h, { before: taskStatus(h, "progress"), text: "In progress" })]
        }),
        property(h, { caption: "Assignee", children: [propertyValue(h, { text: "Unassigned" })] })
      ]
    })

  it("are a group named by its label, the captions in capitals over the values, in two columns 24px apart", () => {
    scene(
      { update, view: viewOf(read) },
      given(initial),
      expect(role("group", { name: "Task" })).toHaveClass("grid-cols-2"),
      expect(role("group", { name: "Task" })).toHaveClass("gap-x-6"),
      expect(role("group", { name: "Task" })).toHaveClass("gap-y-1"),
      expect(text("Status")).toHaveClass("uppercase"),
      expect(text("Status")).toHaveClass("text-meta"),
      expect(text("Status")).toHaveClass("font-medium"),
      expect(text("Status")).toHaveClass("mb-1.25"),
      expect(text("Assignee")).toExist()
    )
  })

  it("read their captions to assistive technology, unless the control under one names itself by it", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          h.div(
            [],
            [
              property(h, { caption: "Status", children: [propertyValue(h, { text: "Triage" })] }),
              property(h, {
                caption: "Priority",
                isCaptionHidden: true,
                children: [button(h, "Priority: High", Message.ClickedOpen())]
              })
            ]
          )
        )
      },
      given(initial),
      expect(text("Status")).not.toHaveAttr("aria-hidden"),
      expect(text("Priority")).toHaveAttr("aria-hidden", "true")
    )
  })

  it("show a value that is read in the look of the quiet button, 8px after what comes before it, in quiet text", () => {
    scene(
      { update, view: viewOf(read) },
      given(initial),
      expect(text("In progress")).toHaveClass("text-hint"),
      expect(text("In progress")).toHaveClass("text-ink-secondary"),
      expect(text("In progress")).toHaveClass("gap-2"),
      expect(text("In progress")).toHaveClass("ps-0.75"),
      expect(within(selector("span.gap-2"), selector("svg path[d^='M8 3.6']"))).toExist(),
      expect(role("button")).toBeAbsent()
    )
  })

  it("show a value with the icon of a property before it, hidden from assistive technology, as the words say it", () => {
    scene(
      { update, view: viewOf((h) => propertyValue(h, { before: propertyIcon(h, "users"), text: "Unassigned" })) },
      given(initial),
      expect(text("Unassigned")).toExist(),
      expect(selector("svg path[d^='M5 7a4']")).toExist(),
      expect(selector("svg")).toHaveAttr("aria-hidden", "true")
    )
  })

  it("show a value with nothing before it as its words alone", () => {
    scene(
      { update, view: viewOf((h) => propertyValue(h, { text: "Unassigned" })) },
      given(initial),
      expect(text("Unassigned")).toHaveClass("min-h-8"),
      expect(selector("svg")).toBeAbsent()
    )
  })
})

describe("activityList", () => {
  const lines = (h: HtmlBuilder<Message>) =>
    activityList(h, {
      label: "Current activity",
      lines: [
        { key: "turn-1", state: "Working", motion: "working", place: "#general" },
        { key: "turn-2", state: "Queued", motion: "thread", place: "#design" },
        { key: "turn-3", state: "Stopping", motion: "tug", place: "Jamie Morgan" }
      ]
    })

  it("lists where the agent is at work, named by its label, a line for each place", () => {
    scene(
      { update, view: viewOf(lines) },
      given(initial),
      expect(selector("ul")).toHaveAttr("aria-label", "Current activity"),
      expect(text("Working")).toExist(),
      expect(text("#general")).toHaveClass("font-medium"),
      expect(text("Queued")).toExist(),
      expect(text("#design")).toExist(),
      expect(text("Stopping")).toExist(),
      expect(text("Jamie Morgan")).toExist()
    )
  })

  it("says the state alone for a turn whose place is not read", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          activityList(h, {
            label: "Current activity",
            lines: [{ key: "turn-1", state: "Working", motion: "working" }]
          })
        )
      },
      given(initial),
      expect(text("Working")).toExist(),
      expect(selector("li span.font-medium")).toBeAbsent()
    )
  })

  it("moves the logo as the state does, 0.875rem, hidden from assistive technology", () => {
    scene(
      { update, view: viewOf(lines) },
      given(initial),
      expect(selector("svg.logo-working")).toHaveAttr("width", "0.875rem"),
      expect(selector("svg.logo-thread")).toHaveAttr("aria-hidden", "true"),
      expect(selector("svg.logo-tug")).toHaveAttr("aria-hidden", "true"),
      expect(role("img")).toBeAbsent()
    )
  })

  it("has no button for a line with no action", () => {
    scene({ update, view: viewOf(lines) }, given(initial), expectAll(all.role("button")).toHaveCount(0))
  })

  describe("with actions", () => {
    const opening = (h: HtmlBuilder<Message>) =>
      activityList(h, {
        label: "Turns under way",
        lines: [
          {
            key: "turn-1",
            state: "Working",
            motion: "working",
            place: "#general",
            action: { name: "Working in #general: open its log", onClick: Message.ClickedOpen() }
          },
          { key: "turn-2", state: "Queued", motion: "thread", place: "#design" },
          {
            key: "turn-3",
            state: "Stopping",
            motion: "tug",
            action: { name: "Stopping: open its log", onClick: Message.ClickedStop() }
          }
        ]
      })

    it("makes a line with an action one button, named by it, that sends its message when it is clicked", () => {
      scene(
        { update, view: viewOf(opening) },
        given(initial),
        expectAll(all.role("button")).toHaveCount(2),
        expect(role("button", { name: "Working in #general: open its log" })).toExist(),
        expect(role("button", { name: "Stopping: open its log" })).toExist(),
        click(role("button", { name: "Working in #general: open its log" })),
        expect(role("status")).toHaveText("Stopped 0, opened 1"),
        click(role("button", { name: "Stopping: open its log" })),
        expect(role("status")).toHaveText("Stopped 1, opened 1")
      )
    })

    it("keeps the logo, the state, and the place inside the button, the logo hidden from assistive technology", () => {
      scene(
        { update, view: viewOf(opening) },
        given(initial),
        expect(within(role("button", { name: "Working in #general: open its log" }), text("Working"))).toExist(),
        expect(within(role("button", { name: "Working in #general: open its log" }), text("#general"))).toHaveClass(
          "font-medium"
        ),
        expect(
          within(role("button", { name: "Working in #general: open its log" }), selector("svg.logo-working"))
        ).toHaveAttr("aria-hidden", "true"),
        expect(within(role("button", { name: "Stopping: open its log" }), selector("svg.logo-tug"))).toExist()
      )
    })

    it("sets the button 6px wider than its words each side, filled on hover, with a focus ring inside it", () => {
      scene(
        { update, view: viewOf(opening) },
        given(initial),
        expect(role("button", { name: "Working in #general: open its log" })).toHaveClass("-mx-1.5"),
        expect(role("button", { name: "Working in #general: open its log" })).toHaveClass("px-1.5"),
        expect(role("button", { name: "Working in #general: open its log" })).toHaveClass("py-0.5"),
        expect(role("button", { name: "Working in #general: open its log" })).toHaveClass("hover:bg-hover"),
        expect(role("button", { name: "Working in #general: open its log" })).toHaveClass("focus-ring-inset"),
        expect(role("button", { name: "Working in #general: open its log" })).toHaveClass("cursor-pointer"),
        expect(role("button", { name: "Working in #general: open its log" })).toHaveClass("text-item")
      )
    })

    it("lists a line with no action beside them as text, in the same column", () => {
      scene(
        { update, view: viewOf(opening) },
        given(initial),
        expectAll(all.role("listitem")).toHaveCount(3),
        expect(within(nth(all.role("listitem"), 1), text("Queued"))).toExist(),
        expect(within(nth(all.role("listitem"), 1), selector("button"))).toBeAbsent(),
        expect(nth(all.role("listitem"), 1)).toHaveClass("items-center"),
        expect(nth(all.role("listitem"), 0)).not.toHaveClass("items-center")
      )
    })
  })
})

describe("person", () => {
  it("is a mark beside a name over a line of what they are, the mark hidden from assistive technology", () => {
    scene(
      {
        update,
        view: viewOf((h) => person(h, { mark: { text: "JM" }, name: "Jamie Morgan · You", detail: "Workspace owner" }))
      },
      given(initial),
      expect(text("Jamie Morgan · You")).toExist(),
      expect(text("Workspace owner")).toExist(),
      expect(text("JM")).toHaveAttr("aria-hidden", "true"),
      expect(text("JM")).toHaveClass("size-10"),
      expect(text("Jamie Morgan · You")).toHaveClass("font-medium")
    )
  })

  it("draws the mark at the size it is given, in the tone it is given, and has no line under a name without a detail", () => {
    scene(
      {
        update,
        view: viewOf((h) => person(h, { mark: { text: "Y", tone: "lilac" }, markSize: "sm", name: "Yumi" }))
      },
      given(initial),
      expect(text("Y")).toHaveClass("size-6"),
      expect(text("Y")).toHaveClass("bg-avatar-lilac-bg"),
      expect(text("Yumi")).toExist(),
      expect(selector("span.text-ink-secondary")).toBeAbsent()
    )
  })
})

describe("badge", () => {
  it("shows its label in every tone, neutral unless given", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          h.div(
            [],
            [
              badge(h, { label: "Queued" }),
              badge(h, { label: "Stopped", tone: "neutral" }),
              badge(h, { label: "Completed", tone: "success" }),
              badge(h, { label: "Running", tone: "caution" }),
              badge(h, { label: "Failed", tone: "danger" })
            ]
          )
        )
      },
      given(initial),
      expect(text("Queued")).toExist(),
      expect(text("Stopped")).toExist(),
      expect(text("Completed")).toExist(),
      expect(text("Running")).toExist(),
      expect(text("Failed")).toExist()
    )
  })
})

describe("turnStatus", () => {
  const states = ["queued", "working", "stopping", "done", "failed", "stopped"] as const

  const statuses = (h: HtmlBuilder<Message>) =>
    h.div(
      [],
      states.map((state) => h.div([h.Id(state)], [turnStatus(h, state)]))
    )

  const words = {
    queued: "Queued",
    working: "Working",
    stopping: "Stopping…",
    done: "Completed",
    failed: "Failed",
    stopped: "Stopped"
  } as const

  for (const state of states) {
    it(`says ${state} as ${words[state]}, in a live region`, () => {
      scene(
        { update, view: viewOf(statuses) },
        given(initial),
        expect(within(selector(`#${state}`), role("status"))).toHaveText(words[state])
      )
    })
  }

  for (const [state, motion] of [
    ["queued", "thread"],
    ["working", "working"],
    ["stopping", "tug"]
  ] as const) {
    it(`moves the logo in its ${motion} motion while the turn is ${state}, hidden from assistive technology`, () => {
      scene(
        { update, view: viewOf(statuses) },
        given(initial),
        expect(selector(`#${state} svg`)).toHaveClass(`logo-${motion}`),
        expect(selector(`#${state} svg`)).toHaveAttr("aria-hidden", "true"),
        expect(selector(`#${state} svg`)).toHaveAttr("width", "0.875rem")
      )
    })
  }

  for (const state of ["done", "failed", "stopped"] as const) {
    it(`draws a still mark, not the logo, once the turn is ${state}`, () => {
      scene(
        { update, view: viewOf(statuses) },
        given(initial),
        expect(selector(`#${state} svg`)).toHaveAttr("aria-hidden", "true"),
        expect(selector(`#${state} svg`)).not.toHaveClass("logo-working"),
        expect(selector(`#${state} [aria-hidden]`)).toHaveClass("size-3.5")
      )
    })
  }

  it("is a quiet tile on subtle, with the logo cut out of it", () => {
    scene(
      { update, view: viewOf(statuses) },
      given(initial),
      expect(within(selector("#working"), role("status"))).toHaveClass("bg-subtle"),
      expect(within(selector("#working"), role("status"))).toHaveClass("text-ink-secondary"),
      expect(within(selector("#working"), role("status"))).toHaveClass("min-h-5.5"),
      expect(within(selector("#working"), role("status"))).toHaveClass(
        "[--amends-status-knockout:var(--amends-subtle)]"
      )
    )
  })

  it("reads a failure in the caution colors, outlined and not filled", () => {
    scene(
      { update, view: viewOf(statuses) },
      given(initial),
      expect(within(selector("#failed"), role("status"))).toHaveClass("text-caution-text"),
      expect(within(selector("#failed"), role("status"))).toHaveClass("inset-ring-caution-border"),
      expect(within(selector("#failed"), role("status"))).not.toHaveClass("bg-subtle")
    )
  })
})

describe("turnActivity", () => {
  const states = ["queued", "working", "stopping", "done"] as const

  const activities = (h: HtmlBuilder<Message>) =>
    h.div(
      [],
      states.map((state) => h.div([h.Id(state)], [turnActivity(h, { state, label: `Yumi ${state}` })]))
    )

  for (const [state, motion] of [
    ["queued", "thread"],
    ["working", "working"],
    ["stopping", "tug"]
  ] as const) {
    it(`says what the agent does in words, with the logo in its ${motion} motion while the turn is ${state}`, () => {
      scene(
        { update, view: viewOf(activities) },
        given(initial),
        expect(selector(`#${state}`)).toHaveText(`Yumi ${state}`),
        expect(selector(`#${state} svg`)).toHaveClass(`logo-${motion}`),
        expect(selector(`#${state} svg`)).toHaveAttr("aria-hidden", "true"),
        expect(selector(`#${state} svg`)).toHaveAttr("width", "0.875rem")
      )
    })
  }

  it("draws a still mark once the turn is done", () => {
    scene(
      { update, view: viewOf(activities) },
      given(initial),
      expect(selector("#done svg")).not.toHaveClass("logo-working"),
      expect(selector("#done [aria-hidden]")).toHaveClass("size-3.5")
    )
  })

  it("is quiet text at hint size with no tile behind it, 5px from its mark", () => {
    scene(
      { update, view: viewOf(activities) },
      given(initial),
      expect(selector("#working span")).toHaveClass("text-hint"),
      expect(selector("#working span")).toHaveClass("text-ink-secondary"),
      expect(selector("#working span")).toHaveClass("gap-1.25"),
      expect(selector("#working span")).not.toHaveClass("bg-subtle"),
      expect(within(selector("#working"), role("status"))).toBeAbsent()
    )
  })
})

const turns = (h: HtmlBuilder<Message>) =>
  entryList(h, {
    label: "Turns",
    children: [
      entry(h, {
        key: "turn-1",
        mark: "SC",
        title: "Scout",
        trailing: [badge(h, { label: "Running", tone: "caution" }), hint(h, "run again by Bob"), sending(h, true)],
        children: [buttonRow(h, [button(h, "Stop", Message.ClickedStop(), { variant: "quiet" })])]
      }),
      entry(h, { key: "turn-2", title: "Yumi" })
    ]
  })

describe("entryList", () => {
  it("is a list named by its label with one item for each entry", () => {
    scene(
      { update, view: viewOf(turns) },
      given(initial),
      expect(role("list", { name: "Turns" })).toExist(),
      expect(within(role("list", { name: "Turns" }), role("listitem"))).toExist()
    )
  })
})

describe("entry", () => {
  it("shows its title with its trailing pieces after it, and its children under it", () => {
    scene(
      { update, view: viewOf(turns) },
      given(initial),
      expect(text("Scout")).toExist(),
      expect(text("Running")).toExist(),
      expect(text("run again by Bob")).toExist(),
      expect(text(" · Sending…")).toExist(),
      click(role("button", { name: "Stop" })),
      expect(role("status")).toHaveText("Stopped 1, opened 0")
    )
  })

  it("hides its mark from assistive technology, and has none unless given one", () => {
    scene(
      { update, view: viewOf(turns) },
      given(initial),
      expect(text("SC")).toHaveAttr("aria-hidden", "true"),
      expect(text("Yumi")).toExist(),
      expect(text("Y")).toBeAbsent()
    )
  })

  it("is an item of its list, whether or not it has anything but a title", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          entryList(h, { label: "Members", children: [entry(h, { key: "member-1", title: "Yumi" })] })
        )
      },
      given(initial),
      expect(within(role("list", { name: "Members" }), role("listitem"))).toExist(),
      expect(within(role("listitem"), text("Yumi"))).toExist()
    )
  })

  it("is one button that sends its message when it is given one, holding its mark, title, and trailing pieces", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          entryList(h, {
            label: "Results",
            children: [
              entry(h, {
                key: "result-group-design",
                mark: "#",
                title: "Design crew",
                trailing: [badge(h, { label: "Private" })],
                onClick: Message.ClickedOpen()
              }),
              entry(h, { key: "result-person-yumi", title: "Yumi", onClick: Message.ClickedOpen() })
            ]
          })
        )
      },
      given(initial),
      expect(within(role("list", { name: "Results" }), role("listitem"))).toExist(),
      expect(within(role("listitem"), role("button", { name: /^Design crew/ }))).toExist(),
      expect(role("button", { name: /^Design crew/ })).toHaveAttr("id", "result-group-design"),
      expect(within(role("button", { name: /^Design crew/ }), text("Private"))).toExist(),
      expect(within(role("button", { name: /^Design crew/ }), text("#"))).toHaveAttr("aria-hidden", "true"),
      expect(role("button", { name: "Yumi" })).toHaveAttr("id", "result-person-yumi"),
      click(role("button", { name: "Yumi" })),
      expect(role("status")).toHaveText("Stopped 0, opened 1")
    )
  })

  it("marks the entry that is active as current, for the field above its list, and no other", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          entryList(h, {
            label: "Results",
            children: [
              entry(h, { key: "result-1", title: "Design crew", onClick: Message.ClickedOpen(), isActive: true }),
              entry(h, { key: "result-2", title: "Yumi", onClick: Message.ClickedOpen(), isActive: false }),
              entry(h, { key: "result-3", title: "Alex Morgan", onClick: Message.ClickedOpen() })
            ]
          })
        )
      },
      given(initial),
      expect(role("button", { name: "Design crew" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Yumi" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Alex Morgan" })).not.toHaveAttr("aria-current")
    )
  })

  it("is not a button unless it is given a message to send", () => {
    scene(
      { update, view: viewOf(turns) },
      given(initial),
      expect(role("button", { name: /Scout/ })).toBeAbsent(),
      expect(role("button", { name: "Stop" })).toExist()
    )
  })
})
