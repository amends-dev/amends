import { AgentPermissions } from "@amends-dev/core/agent"
import { Grant, Scope } from "@amends-dev/core/authorization"
import { Task, TaskPermissions } from "@amends-dev/core/task"
import { ThreadId } from "@amends-dev/core/thread"
import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, general, membership, scout, task } from "../../../test/fixtures.ts"
import { chooseFromMenu, closeMenu, openMenu } from "../../../test/menu.ts"
import { AssigneeMenu } from "../../control/taskFilter.ts"
import { CreateTask, UpdateTask } from "./command.ts"
import { Message, PriorityMenu, StatusMenu } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership
const threadId = ThreadId.ThreadId.make("thread-1")
const inThread = { workspaceId: workspace.id, memberId: member.id, threadId }

const inWorkspace = Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id })

/** The thread read, in general, with bob and the agent scout among its members. */
const opened = modifyFields(init(workspace.id, member.id, threadId).model, {
  groupId: () => Option.some(general.id),
  members: () => [member, bob, scout]
})

/** The thread's task, which someone who may update tasks can change. */
const changeable = modifyFields(opened, {
  task: () => Option.some({ task, pending: false }),
  grants: () => [Grant.make(TaskPermissions.Update, inWorkspace)]
})

describe("a thread's task", () => {
  it("is changed from three menus under their captions by someone who may", () => {
    scene(
      { update, view },
      given(changeable),
      expect(role("group", { name: "Properties" })).toExist(),
      expect(role("button", { name: "Status: Triage" })).toExist(),
      expect(role("button", { name: "Assignee: Unassigned" })).toExist(),
      expect(role("button", { name: "Priority: No priority" })).toExist(),
      expect(text("Status")).toExist(),
      expect(text("Assignee")).toExist(),
      expect(text("Priority")).toExist()
    )
  })

  it("changes the status from the menu, from the one the person saw, and not when they choose it again", () => {
    scene(
      { update, view },
      given(changeable),
      ...chooseFromMenu(StatusMenu, "Status: Triage", "Triage (selected)"),
      Command.expectNone(),
      ...chooseFromMenu(StatusMenu, "Status: Triage", "Doing"),
      Command.expectExact(
        UpdateTask({ ...inThread, change: Task.Change.cases.Status.make({ from: "triage", to: "doing" }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction())
    )
  })

  it("lists every status with its drawing, and says which one is the task's", () => {
    scene(
      { update, view },
      given(changeable),
      expect(within(role("button", { name: "Status: Triage" }), selector("svg"))).toExist(),
      ...openMenu(StatusMenu, "Status: Triage"),
      expect(role("menuitem", { name: "Triage (selected)" })).toExist(),
      expect(role("menuitem", { name: "To do" })).toExist(),
      expect(role("menuitem", { name: "Doing" })).toExist(),
      expect(role("menuitem", { name: "Held" })).toExist(),
      expect(role("menuitem", { name: "Done" })).toExist(),
      expect(role("menuitem", { name: "Dismissed" })).toExist(),
      expect(within(role("menuitem", { name: "Doing" }), selector("svg"))).toExist()
    )
  })

  it("changes the priority from the menu", () => {
    scene(
      { update, view },
      given(changeable),
      ...openMenu(PriorityMenu, "Priority: No priority"),
      expect(role("menuitem", { name: "No priority (selected)" })).toExist(),
      expect(role("menuitem", { name: "Low" })).toExist(),
      expect(role("menuitem", { name: "Urgent" })).toExist(),
      ...closeMenu(PriorityMenu, "Priority: No priority"),
      ...chooseFromMenu(PriorityMenu, "Priority: No priority", "High"),
      Command.expectExact(
        UpdateTask({ ...inThread, change: Task.Change.cases.Priority.make({ from: "none", to: "high" }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction()),
      expect(role("button", { name: "Priority: No priority" })).toExist()
    )
  })

  it("assigns a person from the menu, which lists Unassigned and each person the task can go to, with their marks", () => {
    scene(
      { update, view },
      given(
        modifyFields(changeable, {
          grants: () => [Grant.make(TaskPermissions.Update, inWorkspace)]
        })
      ),
      ...openMenu(AssigneeMenu, "Assignee: Unassigned"),
      expect(role("menuitem", { name: "Unassigned (selected)" })).toExist(),
      expect(role("menuitem", { name: "Alice" })).toExist(),
      expect(role("menuitem", { name: "Bob" })).toExist(),
      expect(role("menuitem", { name: "Scout" })).toBeAbsent(),
      expect(within(role("menuitem", { name: "Bob" }), text("B"))).toExist(),
      ...closeMenu(AssigneeMenu, "Assignee: Unassigned"),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Unassigned", "Bob"),
      Command.expectExact(
        UpdateTask({ ...inThread, change: Task.Change.cases.Assignee.make({ from: null, to: bob.id }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction())
    )
  })

  it("assigns an agent only when the person may use it", () => {
    scene(
      { update, view },
      given(
        modifyFields(changeable, {
          grants: () => [Grant.make(TaskPermissions.Update, inWorkspace), Grant.make(AgentPermissions.Use, inWorkspace)]
        })
      ),
      ...openMenu(AssigneeMenu, "Assignee: Unassigned"),
      expect(role("menuitem", { name: "Scout" })).toExist()
    )
  })

  it("takes the person to the assignee's mark and name once the task is assigned, and back to Unassigned", () => {
    scene(
      { update, view },
      given(
        modifyFields(changeable, { task: () => Option.some({ task: { ...task, assignee: bob.id }, pending: false }) })
      ),
      expect(role("button", { name: "Assignee: Bob" })).toExist(),
      expect(within(role("button", { name: "Assignee: Bob" }), text("B"))).toExist(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Bob", "Unassigned"),
      Command.expectExact(
        UpdateTask({ ...inThread, change: Task.Change.cases.Assignee.make({ from: bob.id, to: null }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction())
    )
  })

  it("names an assignee the person cannot choose from, rather than a raw value", () => {
    scene(
      { update, view },
      given(
        modifyFields(changeable, { task: () => Option.some({ task: { ...task, assignee: scout.id }, pending: false }) })
      ),
      expect(role("button", { name: "Assignee: Scout" })).toExist()
    )
  })

  it("reads as a section of its status, assignee, and priority to someone who may not change it", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { task: () => Option.some({ task, pending: true }) })),
      expect(role("group", { name: "Properties" })).toExist(),
      expect(text("Status")).toExist(),
      expect(text("Triage")).toExist(),
      expect(text("Assignee")).toExist(),
      expect(text("Unassigned")).toExist(),
      expect(text("Priority")).toExist(),
      expect(text("No priority")).toExist(),
      expect(text("Sending…")).toExist(),
      expect(role("button", { name: "Status: Triage" })).toBeAbsent()
    )
  })

  it("reads its assignee by mark and name", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { task: () => Option.some({ task: { ...task, assignee: bob.id }, pending: false }) })),
      expect(text("Bob")).toExist(),
      expect(text("B")).toExist(),
      expect(text("Unassigned")).toBeAbsent(),
      expect(text("Sending…")).toBeAbsent()
    )
  })

  it("is made from the thread by someone who may create tasks in its group", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          grants: () => [Grant.make(TaskPermissions.Create, inWorkspace), Grant.make(AgentPermissions.Use, inWorkspace)]
        })
      ),
      click(role("button", { name: "Make it a task" })),
      Command.expectExact(CreateTask(inThread)),
      Command.resolve(CreateTask, Message.WroteAction())
    )
  })
})
