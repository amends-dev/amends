import { Task } from "@amends-dev/core/task"
import { ThreadId } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import { bob, general, membership, task } from "../../../test/fixtures.ts"
import { type AssigneeChoice, AssigneeMenu } from "../../control/taskFilter.ts"
import { assigneeProperties } from "../../view/taskFilter.ts"
import { CreateTask, UpdateTask } from "./command.ts"
import { AssigneeBinding, PriorityBinding, StatusBinding } from "./composition.ts"
import { Message, PriorityMenu, StatusMenu } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership
const threadId = ThreadId.ThreadId.make("thread-1")
const inThread = { workspaceId: workspace.id, memberId: member.id, threadId }

const opened = modifyFields(init(workspace.id, member.id, threadId).model, { members: () => [member, bob] })

const menuInputs = { items: [], itemToConfig: () => ({ content: null }), buttonContent: null }

/** The status menu reporting that the person chose `status`, as the task receives it. */
const choseStatus = (status: Task.Status) =>
  StatusBinding.embedView({ slotId: "task-status", model: opened.statusMenu, viewInputs: menuInputs }).toParentMessage(
    StatusMenu.Message.SelectedItem({ index: Task.Status.literals.indexOf(status), item: status })
  )

/** The priority menu reporting that the person chose `priority`, as the task receives it. */
const chosePriority = (priority: Task.Priority) =>
  PriorityBinding.embedView({
    slotId: "task-priority",
    model: opened.priorityMenu,
    viewInputs: menuInputs
  }).toParentMessage(
    PriorityMenu.Message.SelectedItem({ index: Task.Priority.literals.indexOf(priority), item: priority })
  )

/** The assignee menu reporting that the person chose `choice`, as the task receives it. */
const choseAssignee = (choice: AssigneeChoice) =>
  AssigneeBinding.embedView({
    slotId: "task-assignee",
    model: opened.assigneeMenu,
    viewInputs: menuInputs
  }).toParentMessage(
    AssigneeMenu.Message.SelectedItem({
      index: assigneeProperties(opened.members, opened.members, null).findIndex(({ value }) => value === choice),
      item: choice
    })
  )

describe("a thread's task", () => {
  it("is made when the person says so, and changed from what they saw, unless nothing changes", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedTask({ groupId: Option.some(general.id), task: Option.none() })),
      message(choseStatus("doing")),
      Command.expectNone(),
      message(Message.ClickedMakeTask()),
      Command.expectExact(CreateTask(inThread)),
      Command.resolve(CreateTask, Message.WroteAction()),
      message(Message.ReceivedTask({ groupId: Option.some(general.id), task: Option.some({ task, pending: false }) })),
      message(choseStatus("triage")),
      Command.expectNone(),
      message(choseStatus("doing")),
      Command.expectExact(
        UpdateTask({ ...inThread, change: Task.Change.cases.Status.make({ from: "triage", to: "doing" }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction()),
      message(chosePriority("high")),
      Command.expectExact(
        UpdateTask({ ...inThread, change: Task.Change.cases.Priority.make({ from: "none", to: "high" }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction()),
      message(choseAssignee("Unassigned")),
      Command.expectNone(),
      message(choseAssignee(`Member:${bob.id}`)),
      Command.expectExact(
        UpdateTask({ ...inThread, change: Task.Change.cases.Assignee.make({ from: null, to: bob.id }) })
      ),
      Command.resolve(UpdateTask, Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      })
    )
  })
})
