import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import {
  all,
  click,
  expect,
  expectAll,
  expectOutMessage,
  given,
  label,
  nth,
  role,
  scene,
  selector,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  art,
  bob,
  design,
  general,
  membership,
  now,
  opening,
  saying,
  scout,
  task,
  thread
} from "../../../test/fixtures.ts"
import { chooseFromMenu, chooseMenuItem, openMenu } from "../../../test/menu.ts"
import { AssigneeFilter, AssigneeMenu, StatusFilterMenu } from "../../taskFilter.ts"
import { OutMessage, type TaskItem } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { tasksView, triageView } from "./view.ts"

const { workspace, member } = membership

const triaging = { update, view: withViewInputs(triageView, { now })() }
const tasking = { update, view: withViewInputs(tasksView, { now })() }

const bobAuthor = ThreadMessage.Author.cases.Member.make({ memberId: bob.id })

/** Alice's thread in general, with no title, whose task is in triage. */
const planning: TaskItem = {
  task,
  thread,
  place: "#General",
  opening: Option.some(opening),
  pending: false,
  lastActiveAt: DateTime.subtract(now, { minutes: 30 })
}

const shippingId = ThreadId.ThreadId.make("thread-2")

/** Bob's thread titled Ship the release, in design, whose task is in todo, assigned to alice. */
const shipping: TaskItem = {
  task: { ...task, threadId: shippingId, groupId: design.id, status: "todo", assignee: member.id },
  thread: { ...thread, id: shippingId, groupId: design.id, title: "Ship the release", createdBy: bobAuthor },
  place: "#Design",
  opening: Option.some(saying(opening, "Ready to ship?")),
  pending: false,
  lastActiveAt: DateTime.subtract(now, { minutes: 10 })
}

const logoId = ThreadId.ThreadId.make("thread-3")

/** The thread titled Review the logo, in general, whose task is done. */
const logo: TaskItem = {
  task: { ...task, threadId: logoId, status: "done" },
  thread: { ...thread, id: logoId, title: "Review the logo" },
  place: "#General",
  opening: Option.none(),
  pending: false,
  lastActiveAt: DateTime.subtract(now, { minutes: 5 })
}

/** The tasks read, with the workspace's members: one in triage, one to do, and one done. */
const read = modifyFields(init(workspace.id, member.id).model, {
  items: () => [planning, shipping, logo],
  members: () => [member, bob]
})

/** The row of the list at `index`. */
const taskRow = (index: number) => nth(all.role("listitem"), index)

/** What the list says where the filters leave no task. */
const noMatches = text("No tasks match these filters.")

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

  it("show each by its status drawn and said, its group's place after the title, its assignee, and how long ago", () => {
    scene(
      triaging,
      given(read),
      expect(within(role("button", { name: "Plans for the week" }), selector("svg"))).toHaveAttr("width", "1rem"),
      expect(within(role("button", { name: "Plans for the week" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Plans for the week" }), text("Triage"))).toExist(),
      expect(within(role("button", { name: "Plans for the week" }), text("#General"))).toHaveClass("text-hint"),
      expect(within(role("button", { name: "Plans for the week" }), text("Unassigned"))).toExist(),
      expect(within(role("button", { name: "Plans for the week" }), text("30m ago"))).toExist(),
      expect(role("button", { name: "Plans for the week" })).toHaveAttr(
        "aria-description",
        "#General · Triage · Unassigned · 30m ago"
      )
    )
  })

  it("label the columns Task, Status, Assignee, and Activity over the rows, which no group column follows", () => {
    scene(
      triaging,
      given(read),
      expect(text("Task")).toExist(),
      expect(text("Status")).toExist(),
      expect(text("Assignee")).toExist(),
      expect(text("Activity")).toExist(),
      expect(text("Group")).toBeAbsent()
    )
  })

  it("have a search and a choice of assignee to narrow them by, and no choice of status", () => {
    scene(
      triaging,
      given(read),
      expect(label("Search tasks")).toHaveAttr("placeholder", "Search tasks…"),
      expect(role("button", { name: "Assignee: Anyone" })).toExist(),
      expect(role("button", { name: "Status: Any status" })).toBeAbsent(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Anyone", "Alice"),
      expect(role("button", { name: "Assignee: Alice" })).toExist(),
      expect(noMatches).toExist(),
      expect(text("0 tasks")).toExist(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Alice", "Unassigned"),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      type(label("Search tasks"), "PLANS"),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      type(label("Search tasks"), "zzz"),
      expect(noMatches).toExist()
    )
  })

  it("list the tasks in triage whatever status the person chose where they could choose one", () => {
    scene(
      triaging,
      given(modifyFields(read, { filter: (filter) => ({ ...filter, status: "doing" as const }) })),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      expect(noMatches).toBeAbsent(),
      expect(text("1 task")).toExist()
    )
  })

  it("say there is nothing to triage while no task waits, and that none match once the person narrows the list", () => {
    scene(
      triaging,
      given(modifyFields(read, { items: () => [shipping, logo] })),
      expect(role("heading", { name: "Nothing to triage", level: 2 })).toExist(),
      expect(art("rest")).toExist(),
      expect(text("Tasks you can see will be listed here.")).toExist(),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      expect(text("0 tasks")).toExist(),
      type(label("Search tasks"), "ship"),
      expect(noMatches).toExist(),
      expect(art("rest")).toBeAbsent(),
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

  it("shows each by its place, its assignee's mark and name, and where it stands", () => {
    scene(
      tasking,
      given(read),
      expect(within(role("button", { name: "Ship the release" }), text("#Design"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("A"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Ship the release" }), text("A"))).toHaveClass("size-6"),
      expect(within(role("button", { name: "Ship the release" }), text("Alice"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("To do"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("10m ago"))).toExist(),
      expect(role("button", { name: "Ship the release" })).toHaveAttr(
        "aria-description",
        "#Design · To do · Alice · 10m ago"
      )
    )
  })

  it("draws an agent's mark in its own tone, and a member not yet read by their ID", () => {
    const assignedTo = (assignee: MemberId.MemberId) =>
      modifyFields(read, {
        items: () => [{ ...shipping, task: { ...shipping.task, assignee } }],
        members: () => [member, scout]
      })

    scene(
      tasking,
      given(assignedTo(scout.id)),
      expect(within(role("button", { name: "Ship the release" }), text("S"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("button", { name: "Ship the release" }), text("Scout"))).toExist()
    )
    scene(
      tasking,
      given(assignedTo(MemberId.MemberId.make("member-9"))),
      expect(within(role("button", { name: "Ship the release" }), text("member-9"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("M"))).toExist()
    )
  })

  it("says a task is on its way in place of its activity while its thread is being started", () => {
    scene(
      tasking,
      given(modifyFields(read, { items: () => [{ ...shipping, pending: true }] })),
      expect(within(role("button", { name: "Ship the release" }), text("Sending…"))).toHaveClass("text-end"),
      expect(within(role("button", { name: "Ship the release" }), text("10m ago"))).toBeAbsent(),
      expect(role("button", { name: "Ship the release" })).toHaveAttr(
        "aria-description",
        "#Design · To do · Alice · Sending…"
      )
    )
  })

  it("draws no row current, since opening a task leaves the list for its group", () => {
    scene(tasking, given(read), expect(selector("[aria-current]")).toBeAbsent())
  })

  it("puts the status menu before the assignee menu in the toolbar, and Triage has the assignee alone", () => {
    scene(
      tasking,
      given(read),
      expect(nth(all.role("button"), 0)).toHaveAccessibleName("Status: Any status"),
      expect(nth(all.role("button"), 1)).toHaveAccessibleName("Assignee: Anyone")
    )
    scene(
      triaging,
      given(read),
      expect(nth(all.role("button"), 0)).toHaveAccessibleName("Assignee: Anyone"),
      expect(role("button", { name: /^Status/ })).toBeAbsent()
    )
  })

  it("narrows to the status the person chooses among those of an open task, and back to all of them", () => {
    scene(
      tasking,
      given(read),
      expect(role("button", { name: "Status: Any status" })).toExist(),
      expect(within(role("button", { name: "Status: Any status" }), text("Status"))).toExist(),
      ...openMenu(StatusFilterMenu, "Status: Any status"),
      expect(role("menuitem", { name: "Any status (selected)" })).toExist(),
      expect(role("menuitem", { name: "To do" })).toExist(),
      expect(role("menuitem", { name: "Held" })).toExist(),
      expect(role("menuitem", { name: "Done" })).toBeAbsent(),
      expect(role("menuitem", { name: "Dismissed" })).toBeAbsent(),
      ...chooseMenuItem(StatusFilterMenu, "Triage"),
      expect(role("button", { name: "Status: Triage" })).toExist(),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      expect(text("1 task")).toExist(),
      ...chooseFromMenu(StatusFilterMenu, "Status: Triage", "Any status"),
      expectAll(all.role("listitem")).toHaveCount(2)
    )
  })

  it("narrows to the tasks assigned as the person chooses: anyone, no one, or a member", () => {
    scene(
      tasking,
      given(read),
      expect(role("button", { name: "Assignee: Anyone" })).toExist(),
      expect(within(role("button", { name: "Assignee: Anyone" }), text("Assignee"))).toExist(),
      ...openMenu(AssigneeMenu, "Assignee: Anyone"),
      expect(role("menuitem", { name: "Anyone (selected)" })).toExist(),
      expect(role("menuitem", { name: "Unassigned" })).toExist(),
      expect(role("menuitem", { name: "Alice" })).toExist(),
      expect(role("menuitem", { name: "Bob" })).toExist(),
      expect(role("menuitem", { name: "Me" })).toBeAbsent(),
      ...chooseMenuItem(AssigneeMenu, "Alice"),
      expect(within(role("button", { name: "Assignee: Alice" }), text("Alice"))).toExist(),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Ship the release" })).toExist(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Alice", "Unassigned"),
      expect(within(role("button", { name: "Assignee: Unassigned" }), text("Unassigned"))).toExist(),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Unassigned", "Bob"),
      expect(noMatches).toExist(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Bob", "Anyone"),
      expectAll(all.role("listitem")).toHaveCount(2)
    )
  })

  it("lists the members still in the workspace by name, each with a mark, an agent's in its own tone", () => {
    const carol = { ...bob, id: MemberId.MemberId.make("member-9"), name: "Carol", status: "removed" as const }

    scene(
      tasking,
      given(modifyFields(read, { members: () => [bob, scout, carol, member] })),
      ...openMenu(AssigneeMenu, "Assignee: Anyone"),
      expectAll(all.role("menuitem")).toHaveCount(5),
      expect(nth(all.role("menuitem"), 0)).toHaveAccessibleName("Anyone (selected)"),
      expect(nth(all.role("menuitem"), 1)).toHaveAccessibleName("Unassigned"),
      expect(nth(all.role("menuitem"), 2)).toHaveAccessibleName("Alice"),
      expect(nth(all.role("menuitem"), 3)).toHaveAccessibleName("Bob"),
      expect(nth(all.role("menuitem"), 4)).toHaveAccessibleName("Scout"),
      expect(role("menuitem", { name: "Carol" })).toBeAbsent(),
      expect(within(role("menuitem", { name: "Alice" }), text("A"))).toHaveClass("size-5.5"),
      expect(within(role("menuitem", { name: "Alice" }), text("A"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("menuitem", { name: "Scout" }), text("S"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("menuitem", { name: "Unassigned" }), selector(".uppercase"))).toBeAbsent()
    )
  })

  it("says the member's name on the button for a member who has left, until it is chosen away", () => {
    const left = { ...bob, status: "removed" as const }

    scene(
      tasking,
      given(
        modifyFields(read, {
          members: () => [member, left],
          filter: (filter) => ({ ...filter, assignee: AssigneeFilter.Member({ memberId: left.id }) })
        })
      ),
      expect(role("button", { name: "Assignee: Bob" })).toExist(),
      expect(noMatches).toExist()
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
      ...chooseFromMenu(StatusFilterMenu, "Status: Any status", "Triage"),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Anyone", "Alice"),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      expect(text("0 tasks")).toExist(),
      expect(noMatches).toExist(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Alice", "Anyone"),
      type(label("Search tasks"), "zzz"),
      expect(noMatches).toExist(),
      type(label("Search tasks"), "  "),
      expect(role("button", { name: "Plans for the week" })).toExist()
    )
  })

  it("says there are no open tasks while every task is done or dismissed, or there are none", () => {
    scene(
      tasking,
      given(modifyFields(read, { items: () => [logo] })),
      expect(role("heading", { name: "No open tasks", level: 2 })).toExist(),
      expect(art("rest")).toExist(),
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
