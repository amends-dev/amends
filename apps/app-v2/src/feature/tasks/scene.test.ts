import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { describe, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import {
  all,
  change,
  click,
  expect,
  expectAll,
  expectOutMessage,
  given,
  label,
  nth,
  role,
  scene,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, dana, design, general, membership, now, opening, saying, task, thread } from "../../../test/fixtures.ts"
import { OutMessage, type TaskItem } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { tasksView, triageView } from "./view.ts"

const { workspace, member } = membership

const triaging = { update, view: withViewInputs(triageView, { now })() }
const tasking = { update, view: withViewInputs(tasksView, { now })() }

const bobAuthor = ThreadMessage.Author.cases.Member.make({ memberId: bob.id })

/** Alice's thread in general, with no title and two replies, whose task is in triage. */
const planning: TaskItem = {
  task,
  thread,
  groupName: "General",
  opening: Option.some(opening),
  replies: 2,
  pending: false,
  lastActiveAt: DateTime.subtract(now, { minutes: 30 })
}

const shippingId = ThreadId.ThreadId.make("thread-2")

/** Bob's thread titled Ship the release, in design, whose task is in todo, assigned to alice, with three replies. */
const shipping: TaskItem = {
  task: { ...task, threadId: shippingId, groupId: design.id, status: "todo", assignee: member.id },
  thread: { ...thread, id: shippingId, groupId: design.id, title: "Ship the release", createdBy: bobAuthor },
  groupName: "Design",
  opening: Option.some(saying(opening, "Ready to ship?")),
  replies: 3,
  pending: false,
  lastActiveAt: DateTime.subtract(now, { minutes: 10 })
}

const logoId = ThreadId.ThreadId.make("thread-3")

/** The thread titled Review the logo, in general, whose task is done. */
const logo: TaskItem = {
  task: { ...task, threadId: logoId, status: "done" },
  thread: { ...thread, id: logoId, title: "Review the logo" },
  groupName: "General",
  opening: Option.none(),
  replies: 0,
  pending: false,
  lastActiveAt: DateTime.subtract(now, { minutes: 5 })
}

/** The tasks read, with the workspace's members: one in triage, one to do, and one done. */
const read = modifyFields(init(workspace.id, member.id).model, {
  items: () => [planning, shipping, logo],
  members: () => [member, bob]
})

/** The row of the table at `index`. */
const taskRow = (index: number) => nth(all.role("listitem"), index)

describe("the tasks in triage", () => {
  it("are a main pane titled Triage, with the line that says what it holds, and the tasks that wait for a decision", () => {
    scene(
      triaging,
      given(read),
      expect(role("main", { name: "Triage" })).toExist(),
      expect(role("heading", { name: "Triage", level: 1 })).toExist(),
      expect(text("Tasks waiting for a decision.")).toExist(),
      expect(text("Tasks in triage across your groups.")).toExist(),
      expect(text("1 task")).toExist(),
      expect(role("list", { name: "Tasks" })).toExist(),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      expect(role("button", { name: "Ship the release" })).toBeAbsent(),
      expect(role("button", { name: "Review the logo" })).toBeAbsent()
    )
  })

  it("show each by its group, its assignee, who started it, its replies, where it stands, and how long ago", () => {
    scene(
      triaging,
      given(read),
      expect(within(role("button", { name: "Plans for the week" }), text("General"))).toExist(),
      expect(within(role("button", { name: "Plans for the week" }), text("–"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Plans for the week" }), text("Triage"))).toExist(),
      expect(within(role("button", { name: "Plans for the week" }), text("30m ago"))).toExist(),
      expect(within(role("button", { name: "Plans for the week" }), text("Open →"))).toExist(),
      expect(role("button", { name: "Plans for the week" })).toHaveAttr(
        "aria-description",
        "Started by Alice · 2 replies · General · Triage · 30m ago"
      )
    )
  })

  it("have a search and a choice of assignee to narrow them by, and no choice of status", () => {
    scene(
      triaging,
      given(read),
      expect(label("Search tasks")).toHaveAttr("placeholder", "Search tasks…"),
      expect(label("Assignee")).toHaveValue("Anyone"),
      expect(label("Status")).toBeAbsent(),
      change(label("Assignee"), "Me"),
      expect(label("Assignee")).toHaveValue("Me"),
      expect(role("heading", { name: "No tasks match", level: 2 })).toExist(),
      expect(text("Try different filters.")).toExist(),
      expect(text("0 tasks")).toExist(),
      change(label("Assignee"), "NoOne"),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      type(label("Search tasks"), "PLANS"),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      type(label("Search tasks"), "zzz"),
      expect(role("heading", { name: "No tasks match", level: 2 })).toExist()
    )
  })

  it("list the tasks in triage whatever status the person chose where they could choose one", () => {
    scene(
      triaging,
      given(modifyFields(read, { filter: (filter) => ({ ...filter, status: "doing" as const }) })),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      expect(role("heading", { name: "No tasks match" })).toBeAbsent(),
      expect(text("1 task")).toExist()
    )
  })

  it("say there is nothing to triage while no task waits, and that none match once the person narrows the list", () => {
    scene(
      triaging,
      given(modifyFields(read, { items: () => [shipping, logo] })),
      expect(role("heading", { name: "Nothing to triage", level: 2 })).toExist(),
      expect(text("Tasks you can see will be listed here.")).toExist(),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      expect(text("0 tasks")).toExist(),
      type(label("Search tasks"), "ship"),
      expect(role("heading", { name: "No tasks match", level: 2 })).toExist(),
      expect(role("heading", { name: "Nothing to triage" })).toBeAbsent()
    )
  })

  it("report the thread of the task the person picks, with its group", () => {
    scene(
      triaging,
      given(read),
      click(role("button", { name: "Plans for the week" })),
      expectOutMessage(OutMessage.OpenedThread({ groupId: general.id, threadId: thread.id }))
    )
  })
})

describe("every open task", () => {
  it("is a main pane titled Tasks, with the tasks that are not done or dismissed, latest active first", () => {
    scene(
      tasking,
      given(read),
      expect(role("main", { name: "Tasks" })).toExist(),
      expect(role("heading", { name: "Tasks", level: 1 })).toExist(),
      expect(text("Every open task you can see.")).toExist(),
      expect(text("Open tasks across your groups.")).toExist(),
      expect(text("2 tasks")).toExist(),
      expectAll(all.role("listitem")).toHaveCount(2),
      expect(within(taskRow(0), role("button", { name: "Ship the release" }))).toExist(),
      expect(within(taskRow(1), role("button", { name: "Plans for the week" }))).toExist(),
      expect(role("button", { name: "Review the logo" })).toBeAbsent()
    )
  })

  it("shows each by its group, its assignee's initials, who started it, its replies, and where it stands", () => {
    scene(
      tasking,
      given(read),
      expect(within(role("button", { name: "Ship the release" }), text("Design"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("A"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Ship the release" }), text("To do"))).toExist(),
      expect(role("button", { name: "Ship the release" })).toHaveAttr(
        "aria-description",
        "Started by Bob · 3 replies · Design · To do · 10m ago"
      )
    )
  })

  it("says a task is on its way while its thread is being started, and names a contact who started it", () => {
    scene(
      tasking,
      given(
        modifyFields(read, {
          items: () => [
            {
              ...shipping,
              pending: true,
              thread: { ...shipping.thread, createdBy: ThreadMessage.Author.cases.Contact.make({ contactId: dana.id }) }
            }
          ],
          contacts: () => [dana]
        })
      ),
      expect(role("button", { name: "Ship the release" })).toHaveAttr(
        "aria-description",
        "Started by Dana · 3 replies · Sending… · Design · To do · 10m ago"
      )
    )
  })

  it("narrows to the status the person chooses among those of an open task, and back to all of them", () => {
    scene(
      tasking,
      given(read),
      expect(label("Status")).toHaveValue("All"),
      expect(role("option", { name: "All statuses" })).toExist(),
      expect(role("option", { name: "To do" })).toExist(),
      expect(role("option", { name: "Held" })).toExist(),
      expect(role("option", { name: "Done" })).toBeAbsent(),
      expect(role("option", { name: "Dismissed" })).toBeAbsent(),
      change(label("Status"), "triage"),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      expect(text("1 task")).toExist(),
      change(label("Status"), "All"),
      expectAll(all.role("listitem")).toHaveCount(2)
    )
  })

  it("narrows to the tasks assigned as the person chooses: anyone, themselves, or no one", () => {
    scene(
      tasking,
      given(read),
      expect(label("Assignee")).toHaveValue("Anyone"),
      change(label("Assignee"), "Me"),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Ship the release" })).toExist(),
      change(label("Assignee"), "NoOne"),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      change(label("Assignee"), "Anyone"),
      expectAll(all.role("listitem")).toHaveCount(2)
    )
  })

  it("narrows to the tasks whose thread's title or opening has the letters typed, in any case", () => {
    scene(
      tasking,
      given(read),
      expect(label("Search tasks")).toHaveAttr("placeholder", "Search tasks…"),
      type(label("Search tasks"), "SHIP"),
      expect(label("Search tasks")).toHaveValue("SHIP"),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Ship the release" })).toExist(),
      type(label("Search tasks"), "ready"),
      expect(role("button", { name: "Ship the release" })).toExist(),
      type(label("Search tasks"), "plans"),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      expect(role("button", { name: "Ship the release" })).toBeAbsent()
    )
  })

  it("narrows by the status, the assignee, and the search together, and says none match when they leave none", () => {
    scene(
      tasking,
      given(read),
      change(label("Status"), "triage"),
      change(label("Assignee"), "Me"),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      expect(text("0 tasks")).toExist(),
      expect(role("heading", { name: "No tasks match", level: 2 })).toExist(),
      expect(text("Try different filters.")).toExist(),
      change(label("Assignee"), "Anyone"),
      type(label("Search tasks"), "zzz"),
      expect(role("heading", { name: "No tasks match", level: 2 })).toExist(),
      type(label("Search tasks"), "  "),
      expect(role("button", { name: "Plans for the week" })).toExist()
    )
  })

  it("says there are no open tasks while every task is done or dismissed, or there are none", () => {
    scene(
      tasking,
      given(modifyFields(read, { items: () => [logo] })),
      expect(role("heading", { name: "No open tasks", level: 2 })).toExist(),
      expect(text("Tasks you can see will be listed here.")).toExist(),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      expect(text("0 tasks")).toExist()
    )
    scene(
      tasking,
      given(modifyFields(read, { items: () => [] })),
      expect(role("heading", { name: "No open tasks", level: 2 })).toExist()
    )
  })

  it("reports the thread of the task the person picks, with its group", () => {
    scene(
      tasking,
      given(read),
      click(role("button", { name: "Ship the release" })),
      expectOutMessage(OutMessage.OpenedThread({ groupId: design.id, threadId: shippingId })),
      click(role("button", { name: "Plans for the week" })),
      expectOutMessage(OutMessage.OpenedThread({ groupId: general.id, threadId: thread.id }))
    )
  })

  it("says why the tasks could not be read, over them", () => {
    scene(
      tasking,
      given(modifyFields(read, { notice: () => Option.some("This browser could not read that. Try again.") })),
      expect(role("alert")).toHaveText("This browser could not read that. Try again."),
      expect(role("button", { name: "Plans for the week" })).toExist()
    )
  })
})
