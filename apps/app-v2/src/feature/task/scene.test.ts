import { AgentPermissions } from "@amends-dev/core/agent"
import { Grant, Scope } from "@amends-dev/core/authorization"
import { TaskPermissions } from "@amends-dev/core/task"
import { ThreadId } from "@amends-dev/core/thread"
import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, click, expect, given, label, role, scene, text } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, general, membership, scout, task } from "../../../test/fixtures.ts"
import { CreateTask } from "./command.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership
const threadId = ThreadId.ThreadId.make("thread-1")

const inWorkspace = Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id })

/** The thread read, in general, with bob and the agent scout among its members. */
const opened = modifyFields(init(workspace.id, member.id, threadId).model, {
  groupId: () => Option.some(general.id),
  members: () => [member, bob, scout]
})

describe("a thread's task", () => {
  it("is changed by someone who may, who assigns an agent only when they may use it", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          task: () => Option.some({ task, pending: false }),
          grants: () => [Grant.make(TaskPermissions.Update, inWorkspace)]
        })
      ),
      expect(role("region", { name: "Task" })).toExist(),
      expect(label("Status")).toExist(),
      expect(label("Priority")).toExist(),
      expect(label("Assignee")).toExist(),
      expect(role("option", { name: "No one" })).toExist(),
      expect(role("option", { name: "Bob" })).toExist(),
      expect(role("option", { name: "Scout" })).toBeAbsent()
    )
  })

  it("reads as a section of its status, priority, and assignee to someone who may not change it", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { task: () => Option.some({ task, pending: true }) })),
      expect(role("region", { name: "Task" })).toExist(),
      expect(text("Triage")).toExist(),
      expect(text("No priority")).toExist(),
      expect(text("No one")).toExist(),
      expect(text(" · Sending…")).toExist(),
      expect(label("Status")).toBeAbsent()
    )
  })

  it("reads its assignee by name", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { task: () => Option.some({ task: { ...task, assignee: bob.id }, pending: false }) })),
      expect(text("Bob")).toExist(),
      expect(text("No one")).toBeAbsent(),
      expect(text(" · Sending…")).toBeAbsent()
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
      Command.expectExact(CreateTask({ workspaceId: workspace.id, memberId: member.id, threadId })),
      Command.resolve(CreateTask, Message.WroteAction())
    )
  })
})
