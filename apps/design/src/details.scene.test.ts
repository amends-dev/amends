import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button, buttonRow, hint, sending } from "./control.ts"
import { badge, detailList, entry, entryList, log } from "./details.ts"

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
