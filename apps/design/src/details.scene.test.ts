import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button, buttonRow, hint, sending } from "./control.ts"
import { badge, detailList, entry, entryList, log, person } from "./details.ts"

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

  it("has no logo unless it is given a motion", () => {
    scene(
      { update, view: viewOf((h) => badge(h, { label: "Queued" })) },
      given(initial),
      expect(selector("svg")).toBeAbsent()
    )
  })

  for (const motion of ["thread", "working", "tug"] as const) {
    it(`moves the logo in its ${motion} motion before the label, hidden from assistive technology`, () => {
      scene(
        {
          update,
          view: viewOf((h) => h.span([h.Id("turn")], [badge(h, { label: "Running", tone: "caution", motion })]))
        },
        given(initial),
        expect(selector("#turn svg")).toHaveClass(`logo-${motion}`),
        expect(selector("#turn svg")).toHaveAttr("aria-hidden", "true"),
        expect(selector("#turn svg")).toHaveAttr("width", "0.875rem"),
        expect(text("Running")).toExist()
      )
    })
  }

  it("cuts the logo out of the badge's own surface", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          h.div(
            [],
            [
              badge(h, { label: "Running", tone: "caution", motion: "working" }),
              badge(h, { label: "Queued", motion: "thread" })
            ]
          )
        )
      },
      given(initial),
      expect(text("Running")).toHaveClass("[--amends-status-knockout:var(--amends-caution-surface)]"),
      expect(text("Queued")).toHaveClass("[--amends-status-knockout:var(--amends-subtle)]")
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

describe("log", () => {
  it("is an ordered list named by its label with a line for each item", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          log(h, {
            label: "Log",
            items: ["Read 1 message", "Replied: Looks good.", "Stopped short: The model was unavailable."]
          })
        )
      },
      given(initial),
      expect(role("list", { name: "Log" })).toExist(),
      expect(within(role("list", { name: "Log" }), text("Read 1 message"))).toExist(),
      expect(within(role("list", { name: "Log" }), text("Replied: Looks good."))).toExist(),
      expect(within(role("list", { name: "Log" }), text("Stopped short: The model was unavailable."))).toExist()
    )
  })
})
