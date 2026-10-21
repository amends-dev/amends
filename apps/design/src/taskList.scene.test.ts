import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, nth, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { taskHeadings, taskList, taskListEmpty, type TaskListRow } from "./taskList.ts"

const Message = defineMessageUnion({ ClickedComposer: {}, ClickedRelease: {}, ClickedLogo: {} })
type Message = typeof Message.Type

type Model = Readonly<{ opened: ReadonlyArray<string> }>

const initial: Model = { opened: [] }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedComposer: () => ({ model: modifyFields(model, { opened: (opened) => [...opened, "composer"] }) }),
    ClickedRelease: () => ({ model: modifyFields(model, { opened: (opened) => [...opened, "release"] }) }),
    ClickedLogo: () => ({ model: modifyFields(model, { opened: (opened) => [...opened, "logo"] }) })
  })

const viewOf = (render: (h: HtmlBuilder<Message>) => ReadonlyArray<Html>) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div([], [h.p([h.Role("status")], [`Opened ${model.opened.join(", ")}`]), ...render(h)])

const composer: TaskListRow<Message> = {
  key: "composer",
  title: "Composer crashes on paste",
  status: { shape: "open", label: "To do" },
  assignee: { name: "Alex Morgan", mark: { text: "AM" } },
  activity: "2m ago",
  onClick: Message.ClickedComposer()
}

const release: TaskListRow<Message> = {
  key: "release",
  title: "Ship the release",
  status: { shape: "progress", label: "Doing" },
  place: "#general",
  activity: "14m ago",
  onClick: Message.ClickedRelease()
}

const logo: TaskListRow<Message> = {
  key: "logo",
  title: "Review the logo",
  status: { shape: "done", label: "Done" },
  isFinished: true,
  assignee: { name: "Yumi", mark: { text: "Y", tone: "lilac" } },
  activity: "Yesterday",
  onClick: Message.ClickedLogo()
}

const rows = (h: HtmlBuilder<Message>) => [taskList(h, [composer, release, logo])]

const composerButton = role("button", { name: "Composer crashes on paste" })
const releaseButton = role("button", { name: "Ship the release" })
const logoButton = role("button", { name: "Review the logo" })

describe("taskHeadings", () => {
  const headings = (h: HtmlBuilder<Message>) => [taskHeadings(h)]

  it("labels the columns Task, Status, Assignee, and Activity, hidden from assistive technology", () => {
    scene(
      { update, view: viewOf(headings) },
      given(initial),
      expect(selector('div[aria-hidden="true"]')).toExist(),
      expect(within(selector('div[aria-hidden="true"]'), text("Task"))).toExist(),
      expect(within(selector('div[aria-hidden="true"]'), text("Status"))).toExist(),
      expect(within(selector('div[aria-hidden="true"]'), text("Assignee"))).toExist(),
      expect(within(selector('div[aria-hidden="true"]'), text("Activity"))).toExist(),
      expectAll(all.role("columnheader")).toHaveCount(0)
    )
  })

  it("sets them in a quiet caption's size and case, 40px tall, with the stitch along their foot", () => {
    scene(
      { update, view: viewOf(headings) },
      given(initial),
      expect(selector('div[aria-hidden="true"]')).toHaveClass("h-10"),
      expect(selector('div[aria-hidden="true"]')).toHaveClass("text-meta"),
      expect(selector('div[aria-hidden="true"]')).toHaveClass("uppercase"),
      expect(selector('div[aria-hidden="true"]')).toHaveClass("font-medium"),
      expect(selector('div[aria-hidden="true"]')).toHaveClass("text-ink-secondary"),
      expect(selector("span.border-dashed.border-stitch")).toHaveClass("bottom-0")
    )
  })

  it("lies in the columns of the rows, the label of Task over the drawing and the title", () => {
    scene(
      { update, view: viewOf((h) => [taskHeadings(h), taskList(h, [composer])]) },
      given(initial),
      expect(selector('div[aria-hidden="true"]')).toHaveClass("grid-cols-[1rem_minmax(0,1fr)_7rem_9.25rem_5.5rem]"),
      expect(selector('div[aria-hidden="true"]')).toHaveClass(
        "max-desktop:grid-cols-[1rem_minmax(0,1fr)_9.25rem_4.5rem]"
      ),
      expect(selector('div[aria-hidden="true"]')).toHaveClass(
        "max-tablet:grid-cols-[1rem_minmax(0,1fr)_1.5rem_3.5rem]"
      ),
      expect(composerButton).toHaveClass("grid-cols-[1rem_minmax(0,1fr)_7rem_9.25rem_5.5rem]"),
      expect(composerButton).toHaveClass("max-desktop:grid-cols-[1rem_minmax(0,1fr)_9.25rem_4.5rem]"),
      expect(composerButton).toHaveClass("max-tablet:grid-cols-[1rem_minmax(0,1fr)_1.5rem_3.5rem]"),
      expect(text("Task")).toHaveClass("col-span-2"),
      expect(text("Activity")).toHaveClass("text-end")
    )
  })

  it("drops the Status label below 64rem with the words, and all the labels below 48rem", () => {
    scene(
      { update, view: viewOf(headings) },
      given(initial),
      expect(text("Status")).toHaveClass("max-desktop:hidden"),
      expect(text("Assignee")).not.toHaveClass("max-desktop:hidden"),
      expect(selector('div[aria-hidden="true"]')).toHaveClass("max-tablet:hidden")
    )
  })
})

describe("taskList", () => {
  it("is a list named Tasks with an item for each row, each one button named by its task's title", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(role("list", { name: "Tasks" })).toExist(),
      expectAll(all.role("listitem")).toHaveCount(3),
      expectAll(all.role("button")).toHaveCount(3),
      expect(within(nth(all.role("listitem"), 0), composerButton)).toExist(),
      expect(within(nth(all.role("listitem"), 1), releaseButton)).toExist(),
      expect(within(nth(all.role("listitem"), 2), logoButton)).toExist()
    )
  })

  it("sends the message of the row that is clicked", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      click(releaseButton),
      click(composerButton),
      click(logoButton),
      expect(role("status")).toHaveText("Opened release, composer, logo")
    )
  })

  it("draws the status at 1rem, hidden from assistive technology, before the title, and says it in a word", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(composerButton, selector("svg"))).toHaveAttr("width", "1rem"),
      expect(within(composerButton, selector("svg"))).toHaveAttr("height", "1rem"),
      expect(within(composerButton, selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(composerButton, selector("svg"))).toHaveClass("text-ink-secondary"),
      expect(within(logoButton, selector("svg"))).toHaveClass("text-ink"),
      expect(within(composerButton, text("To do"))).toHaveClass("max-desktop:hidden"),
      expect(within(composerButton, text("To do"))).toHaveClass("text-hint"),
      expect(within(releaseButton, text("Doing"))).toExist(),
      expect(within(logoButton, text("Done"))).toExist()
    )
  })

  it("sets the title in medium weight, quiet once its task is finished", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(composerButton, text("Composer crashes on paste"))).toHaveClass("font-medium"),
      expect(within(composerButton, text("Composer crashes on paste"))).toHaveClass("text-ink"),
      expect(within(composerButton, text("Composer crashes on paste"))).toHaveClass("truncate"),
      expect(within(logoButton, text("Review the logo"))).toHaveClass("font-medium"),
      expect(within(logoButton, text("Review the logo"))).toHaveClass("text-ink-secondary"),
      expect(within(logoButton, text("Review the logo"))).not.toHaveClass("text-ink")
    )
  })

  it("wraps the title below 48rem, where it would be cut off by an ellipsis", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(composerButton, text("Composer crashes on paste"))).toHaveClass("max-tablet:whitespace-normal")
    )
  })

  it("shows an assignee as a 24px mark and a name, the mark in its tone and hidden from assistive technology", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(composerButton, text("AM"))).toHaveClass("size-6"),
      expect(within(composerButton, text("AM"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(composerButton, text("AM"))).toHaveAttr("aria-hidden", "true"),
      expect(within(composerButton, text("Alex Morgan"))).toHaveClass("truncate"),
      expect(within(logoButton, text("Y"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(logoButton, text("Yumi"))).toExist()
    )
  })

  it("drops the assignee's name below 48rem, where the mark stands for it", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(composerButton, text("Alex Morgan"))).toHaveClass("max-tablet:hidden"),
      expect(within(composerButton, text("AM"))).not.toHaveClass("max-tablet:hidden")
    )
  })

  it("shows no assignee as the people icon in a 24px box and Unassigned in quiet text", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(releaseButton, text("Unassigned"))).toHaveClass("max-tablet:hidden"),
      expect(within(releaseButton, text("Unassigned"))).toExist(),
      expect(within(releaseButton, selector("span.size-6.grid svg"))).toExist(),
      expect(within(releaseButton, selector("span.size-6.grid span"))).toHaveAttr("aria-hidden", "true"),
      expect(within(releaseButton, selector("span.text-ink-secondary.text-control"))).toExist(),
      expect(within(composerButton, text("Unassigned"))).toBeAbsent()
    )
  })

  it("ends the row with the activity, at the end of its column, on one line", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(composerButton, text("2m ago"))).toHaveClass("text-end"),
      expect(within(composerButton, text("2m ago"))).toHaveClass("whitespace-nowrap"),
      expect(within(composerButton, text("2m ago"))).toHaveClass("text-control"),
      expect(within(logoButton, text("Yesterday"))).toExist()
    )
  })

  it("puts the place after the title in quiet text, when a row has one", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(releaseButton, text("#general"))).toHaveClass("text-ink-secondary"),
      expect(within(releaseButton, text("#general"))).toHaveClass("text-hint"),
      expect(within(releaseButton, text("#general"))).toHaveClass("flex-none"),
      expect(within(composerButton, selector("span.text-hint.flex-none"))).toBeAbsent()
    )
  })

  it("moves the place under the title below 48rem, where the title wraps", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(within(releaseButton, selector("span.items-baseline"))).toHaveClass("max-tablet:flex-col"),
      expect(within(releaseButton, selector("span.items-baseline"))).toHaveClass("max-tablet:items-start"),
      expect(within(releaseButton, text("#general"))).toHaveClass("max-tablet:max-w-full")
    )
  })

  it("is 56px tall, 60px below 48rem, filled on hover, and as wide as the list", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(composerButton).toHaveClass("min-h-14"),
      expect(composerButton).toHaveClass("max-tablet:min-h-15"),
      expect(composerButton).toHaveClass("w-full"),
      expect(composerButton).toHaveClass("px-3"),
      expect(composerButton).toHaveClass("hover:bg-hover"),
      expect(composerButton).toHaveClass("focus-ring-inset"),
      expect(composerButton).toHaveClass("cursor-pointer")
    )
  })

  it("describes each row by all it says, whatever the width leaves out", () => {
    scene(
      { update, view: viewOf(rows) },
      given(initial),
      expect(composerButton).toHaveAttr("aria-description", "To do · Alex Morgan · 2m ago"),
      expect(releaseButton).toHaveAttr("aria-description", "#general · Doing · Unassigned · 14m ago"),
      expect(logoButton).toHaveAttr("aria-description", "Done · Yumi · Yesterday")
    )
  })

  it("is current only for the row that isCurrent: filled selected, with the bar at its start", () => {
    scene(
      { update, view: viewOf((h) => [taskList(h, [composer, { ...release, isCurrent: true }, logo])]) },
      given(initial),
      expect(releaseButton).toHaveAttr("aria-current", "true"),
      expect(releaseButton).toHaveClass("aria-[current=true]:bg-selected"),
      expect(releaseButton).toHaveClass("aria-[current=true]:indicator-bar"),
      expect(composerButton).not.toHaveAttr("aria-current"),
      expect(logoButton).not.toHaveAttr("aria-current")
    )
    scene({ update, view: viewOf(rows) }, given(initial), expect(selector("[aria-current]")).toBeAbsent())
  })

  it("is an empty list, and no more, for no rows", () => {
    scene(
      { update, view: viewOf((h) => [taskList(h, [])]) },
      given(initial),
      expect(role("list", { name: "Tasks" })).toExist(),
      expectAll(all.role("listitem")).toHaveCount(0)
    )
  })
})

describe("taskListEmpty", () => {
  it("is a quiet line of the words it is given, 32px from the labels, in the rows' inset", () => {
    scene(
      { update, view: viewOf((h) => [taskListEmpty(h, "No tasks match these filters.")]) },
      given(initial),
      expect(text("No tasks match these filters.")).toHaveClass("text-ink-secondary"),
      expect(text("No tasks match these filters.")).toHaveClass("text-control"),
      expect(text("No tasks match these filters.")).toHaveClass("py-8"),
      expect(text("No tasks match these filters.")).toHaveClass("px-3"),
      expectAll(all.role("button")).toHaveCount(0)
    )
  })
})
