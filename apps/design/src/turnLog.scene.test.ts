import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, nth, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button } from "./control.ts"
import { activityMark } from "./mark.ts"
import {
  turnLogActivity,
  turnLogCard,
  turnLogColumn,
  turnLogEntry,
  turnLogFooter,
  turnLogProblem,
  turnLogResponse,
  turnLogSummary
} from "./turnLog.ts"

const Message = defineMessageUnion({ ClickedAction: {} })
type Message = typeof Message.Type

type Model = Readonly<{ actions: number }>

const initial: Model = { actions: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedAction: () => ({ model: modifyFields(model, { actions: (actions) => actions + 1 }) })
  })

const viewOf = (render: (h: HtmlBuilder<Message>) => Html) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div([], [h.p([h.Role("status")], [`Actions ${model.actions}`]), render(h)])

describe("turnLogColumn", () => {
  it("holds a turn log's pieces in a column, 20px apart", () => {
    scene(
      {
        update,
        view: viewOf((h) => turnLogColumn(h, [h.p([], ["First"]), h.p([], ["Second"])]))
      },
      given(initial),
      expect(selector("div.flex-col")).toHaveClass("gap-5"),
      expect(within(selector("div.gap-5"), text("First"))).toExist(),
      expect(within(selector("div.gap-5"), text("Second"))).toExist()
    )
  })
})

describe("turnLogSummary", () => {
  const summary = viewOf((h) =>
    turnLogSummary(h, [
      { text: "Thread in #general" },
      { text: "OpenRouter · claude-opus-5-5", isCode: true },
      { text: "Harness · opencode" },
      { text: "Sandbox · Daytona" }
    ])
  )

  it("is a box on subtle of a line each, 8px apart, quiet, at control size", () => {
    scene(
      { update, view: summary },
      given(initial),
      expect(selector("div.bg-subtle")).toHaveClass("flex-col"),
      expect(selector("div.bg-subtle")).toHaveClass("gap-2"),
      expect(selector("div.bg-subtle")).toHaveClass("text-control"),
      expect(selector("div.bg-subtle")).toHaveClass("text-ink-secondary"),
      expect(selector("div.bg-subtle")).toHaveClass("px-3.5"),
      expect(selector("div.bg-subtle")).toHaveClass("py-3"),
      expect(within(selector("div.bg-subtle"), text("Thread in #general"))).toExist(),
      expect(within(selector("div.bg-subtle"), text("Harness · opencode"))).toExist(),
      expect(within(selector("div.bg-subtle"), text("Sandbox · Daytona"))).toExist()
    )
  })

  it("shows the line of an identifier, such as the model's, in mono, and no other", () => {
    scene(
      { update, view: summary },
      given(initial),
      expect(text("OpenRouter · claude-opus-5-5")).toHaveClass("font-mono"),
      expect(text("Thread in #general")).not.toHaveClass("font-mono"),
      expect(text("Harness · opencode")).not.toHaveClass("font-mono")
    )
  })
})

describe("turnLogActivity", () => {
  const activity = viewOf((h) =>
    turnLogActivity(h, {
      label: "Activity",
      children: [
        turnLogEntry(h, {
          key: "accepted",
          title: "Work accepted",
          time: "12:02 PM",
          dateTime: "2026-10-18T12:02:00.000Z",
          timeTitle: "Sunday, October 18, 2026 at 12:02 PM",
          text: "Scout picked up the request from this thread."
        }),
        turnLogEntry(h, {
          key: "completed",
          title: "Turn completed",
          time: "12:03 PM",
          dateTime: "2026-10-18T12:03:00Z"
        })
      ]
    })
  )

  it("is an ordered list named Activity that begins with a divider of the same word, 18px between its entries", () => {
    scene(
      { update, view: activity },
      given(initial),
      expect(role("list", { name: "Activity" })).toHaveClass("gap-4.5"),
      expect(role("list", { name: "Activity" })).toHaveClass("list-none"),
      expect(selector("ol")).toExist(),
      expectAll(all.role("listitem")).toHaveCount(3),
      expect(nth(all.role("listitem"), 0)).toHaveClass("uppercase"),
      expect(within(nth(all.role("listitem"), 0), text("Activity"))).toExist(),
      expect(within(nth(all.role("listitem"), 1), text("Work accepted"))).toExist(),
      expect(within(nth(all.role("listitem"), 2), text("Turn completed"))).toExist()
    )
  })

  it("has the id it is given, which a program finds it by, and none otherwise", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          turnLogActivity(h, {
            id: "turn-log-turn-1",
            label: "Activity",
            children: [
              turnLogEntry(h, {
                key: "accepted",
                title: "Work accepted",
                time: "12:02 PM",
                dateTime: "2026-10-18T12:02:00Z"
              })
            ]
          })
        )
      },
      given(initial),
      expect(role("list", { name: "Activity" })).toHaveAttr("id", "turn-log-turn-1")
    )
    scene({ update, view: activity }, given(initial), expect(role("list", { name: "Activity" })).not.toHaveAttr("id"))
  })

  it("lays an entry out as a dot, its title and its time, and the line under the title", () => {
    scene(
      { update, view: activity },
      given(initial),
      expect(nth(all.role("listitem"), 1)).toHaveClass("grid"),
      expect(nth(all.role("listitem"), 1)).toHaveClass("grid-cols-[0.75rem_minmax(0,1fr)_auto]"),
      expect(within(nth(all.role("listitem"), 1), selector("span.rounded-full"))).toHaveAttr("aria-hidden", "true"),
      expect(text("Work accepted")).toHaveClass("font-medium"),
      expect(text("Work accepted")).toHaveClass("text-control"),
      expect(text("Work accepted")).toHaveClass("text-ink"),
      expect(text("12:02 PM")).toHaveClass("text-meta"),
      expect(text("12:02 PM")).toHaveClass("text-ink-secondary"),
      expect(text("Scout picked up the request from this thread.")).toHaveClass("col-[2/-1]"),
      expect(text("Scout picked up the request from this thread.")).toHaveClass("text-ink-secondary")
    )
  })

  it("shows the time of an entry as a time element that names it in full on hover, and has no line without words", () => {
    scene(
      { update, view: activity },
      given(initial),
      expectAll(all.selector("time")).toHaveCount(2),
      expect(nth(all.selector("time"), 0)).toHaveText("12:02 PM"),
      expect(nth(all.selector("time"), 0)).toHaveAttr("title", "Sunday, October 18, 2026 at 12:02 PM"),
      expect(nth(all.selector("time"), 1)).not.toHaveAttr("title"),
      expect(within(nth(all.role("listitem"), 2), selector("p"))).toBeAbsent()
    )
  })
})

describe("turnLogResponse", () => {
  const response = viewOf((h) =>
    turnLogActivity(h, {
      label: "Activity",
      children: [
        turnLogResponse(h, {
          key: "response-1",
          title: "Reply recorded",
          label: "Complete",
          text: "Deploy the **API** first, then the clients.",
          note: "This response was posted to the thread."
        })
      ]
    })
  )

  it("is an item of the activity that holds a card of its title, its label, its text, and whether it was posted", () => {
    scene(
      { update, view: response },
      given(initial),
      expect(within(nth(all.role("listitem"), 1), text("Reply recorded"))).toExist(),
      expect(within(nth(all.role("listitem"), 1), text("Complete"))).toHaveClass("text-meta"),
      expect(within(nth(all.role("listitem"), 1), text("This response was posted to the thread."))).toHaveClass(
        "text-hint"
      ),
      expect(within(nth(all.role("listitem"), 1), selector("div.border"))).toHaveClass("bg-panel")
    )
  })

  it("shows the text as the markdown it is", () => {
    scene(
      { update, view: response },
      given(initial),
      expect(within(nth(all.role("listitem"), 1), selector("strong"))).toHaveText("API"),
      expect(within(nth(all.role("listitem"), 1), selector("div.text-body"))).toHaveClass("text-ink")
    )
  })
})

describe("turnLogCard", () => {
  const cards = viewOf((h) =>
    turnLogColumn(h, [
      turnLogCard(h, {
        title: "Queued",
        mark: activityMark(h, "thread"),
        note: "Waiting to start. There is no output yet."
      }),
      turnLogCard(h, {
        title: "Review the agent’s setup",
        tone: "caution",
        note: "Fix what stopped this turn before starting another attempt.",
        action: button(h, "Agent settings", Message.ClickedAction())
      })
    ])
  )

  it("is a bordered box on panel, 10px between its pieces", () => {
    scene(
      { update, view: cards },
      given(initial),
      expect(selector("div.bg-panel")).toHaveClass("border"),
      expect(selector("div.bg-panel")).toHaveClass("border-outline"),
      expect(selector("div.bg-panel")).toHaveClass("gap-2.5"),
      expect(selector("div.bg-panel")).toHaveClass("flex-col"),
      expect(text("Queued")).toHaveClass("font-medium"),
      expect(text("Queued")).toHaveClass("text-control"),
      expect(text("Waiting to start. There is no output yet.")).toHaveClass("text-ink-secondary"),
      expect(text("Waiting to start. There is no output yet.")).toHaveClass("text-hint")
    )
  })

  it("draws a mark before its title, moving as the logo does and hidden from assistive technology", () => {
    scene(
      { update, view: cards },
      given(initial),
      expect(within(text("Queued"), selector("svg.logo-thread"))).toHaveAttr("aria-hidden", "true"),
      expect(within(text("Review the agent’s setup"), selector("svg"))).toBeAbsent()
    )
  })

  it("is on the caution colors when it is told to be, with its note in ink for contrast, and holds its action", () => {
    scene(
      { update, view: cards },
      given(initial),
      expect(selector("div.bg-caution-surface")).toHaveClass("border-caution-border"),
      expect(text("Fix what stopped this turn before starting another attempt.")).toHaveClass("text-ink"),
      expect(text("Fix what stopped this turn before starting another attempt.")).not.toHaveClass("text-ink-secondary"),
      expect(within(selector("div.bg-caution-surface"), role("button", { name: "Agent settings" }))).toExist(),
      click(role("button", { name: "Agent settings" })),
      expect(role("status")).toHaveText("Actions 1")
    )
  })

  it("has no label, text, or action unless it is given them", () => {
    scene(
      { update, view: cards },
      given(initial),
      expect(within(selector("div.bg-panel"), role("button"))).toBeAbsent(),
      expect(within(selector("div.bg-panel"), selector("span.text-meta"))).toBeAbsent(),
      expect(within(selector("div.bg-panel"), selector("div.text-body"))).toBeAbsent()
    )
  })
})

describe("turnLogProblem", () => {
  it("says why a stop or retry did not go through, as an alert in the caution color at control size", () => {
    scene(
      { update, view: viewOf((h) => turnLogProblem(h, "Couldn’t start another attempt. Try again.")) },
      given(initial),
      expect(role("alert")).toHaveText("Couldn’t start another attempt. Try again."),
      expect(role("alert")).toHaveClass("text-caution-text"),
      expect(role("alert")).toHaveClass("text-control")
    )
  })
})

describe("turnLogFooter", () => {
  it("says it follows the log live with the logo working before its words", () => {
    scene(
      { update, view: viewOf((h) => turnLogFooter(h, { mark: "following", text: "Following live" })) },
      given(initial),
      expect(selector("div.min-h-9")).toHaveClass("text-control"),
      expect(selector("div.min-h-9")).toHaveClass("text-ink-secondary"),
      expect(selector("div.min-h-9")).toHaveClass("gap-3"),
      expect(text("Following live")).toExist(),
      expect(within(selector("div.min-h-9"), selector("svg.logo-working"))).toExist(),
      expect(within(selector("div.min-h-9"), selector("span[aria-hidden='true']"))).toExist()
    )
  })

  it("says it waits with a clock before its words, hidden from assistive technology", () => {
    scene(
      { update, view: viewOf((h) => turnLogFooter(h, { mark: "waiting", text: "Waiting for activity" })) },
      given(initial),
      expect(text("Waiting for activity")).toExist(),
      expect(within(selector("div.min-h-9"), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(selector("div.min-h-9"), selector("svg.logo-working"))).toBeAbsent()
    )
  })

  it("holds the action to take, before its words", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          turnLogFooter(h, {
            action: button(h, "Retry turn", Message.ClickedAction()),
            text: "Previous log stays available."
          })
        )
      },
      given(initial),
      expect(within(selector("div.min-h-9"), role("button", { name: "Retry turn" }))).toExist(),
      expect(text("Previous log stays available.")).toExist(),
      expect(within(selector("div.min-h-9"), selector("svg"))).toBeAbsent(),
      click(role("button", { name: "Retry turn" })),
      expect(role("status")).toHaveText("Actions 1")
    )
  })

  it("is only its words when it has nothing else, and nothing when it has nothing", () => {
    scene(
      { update, view: viewOf((h) => turnLogFooter(h, { text: "This turn has finished." })) },
      given(initial),
      expect(within(selector("div.min-h-9"), text("This turn has finished."))).toExist(),
      expect(within(selector("div.min-h-9"), role("button"))).toBeAbsent(),
      expect(within(selector("div.min-h-9"), selector("svg"))).toBeAbsent()
    )
  })
})
