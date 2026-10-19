import { Task } from "@amends-dev/core/task"
import { ThreadId } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { bob, general, membership, task } from "../../../test/fixtures.ts"
import { CreateTask, UpdateTask } from "./command.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership
const threadId = ThreadId.ThreadId.make("thread-1")
const inThread = { workspaceId: workspace.id, memberId: member.id, threadId }

const opened = init(workspace.id, member.id, threadId).model

describe("a thread's task", () => {
  it("is made when the person says so, and changed from what they saw, unless nothing changes", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedTask({ groupId: Option.some(general.id), task: Option.none() })),
      message(Message.ChoseStatus({ status: "doing" })),
      Command.expectNone(),
      message(Message.ClickedMakeTask()),
      Command.expectExact(CreateTask(inThread)),
      Command.resolve(CreateTask, Message.WroteAction()),
      message(Message.ReceivedTask({ groupId: Option.some(general.id), task: Option.some({ task, pending: false }) })),
      message(Message.ChoseStatus({ status: "triage" })),
      Command.expectNone(),
      message(Message.ChoseStatus({ status: "doing" })),
      Command.expectExact(
        UpdateTask({ ...inThread, change: Task.Change.cases.Status.make({ from: "triage", to: "doing" }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction()),
      message(Message.ChosePriority({ priority: "high" })),
      Command.expectExact(
        UpdateTask({ ...inThread, change: Task.Change.cases.Priority.make({ from: "none", to: "high" }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction()),
      message(Message.ChoseAssignee({ memberId: Option.some(bob.id) })),
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
