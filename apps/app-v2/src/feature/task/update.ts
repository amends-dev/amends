import { Task } from "@amends-dev/core/task"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { CreateTask, UpdateTask } from "./command.ts"
import { TaskComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"

/** Change the task as `changeOf` says from what the person saw, unless it changes nothing. */
const changing = (model: Model, changeOf: (task: Task.Task) => Task.Change) =>
  Option.match(model.task, {
    onNone: () => ({ model }),
    onSome: ({ task }) => {
      const change = changeOf(task)
      return change.from === change.to
        ? { model }
        : {
            model,
            commands: [
              UpdateTask({ workspaceId: model.workspaceId, memberId: model.memberId, threadId: model.threadId, change })
            ]
          }
    }
  })

export const update = TaskComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedTask: ({ groupId, task }) => ({ model: modifyFields(model, { groupId: () => groupId, task: () => task }) }),
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedMakeTask: () => ({
      model,
      commands: [CreateTask({ workspaceId: model.workspaceId, memberId: model.memberId, threadId: model.threadId })]
    }),
    ChoseStatus: ({ status }) =>
      changing(model, (task) => Task.Change.cases.Status.make({ from: task.status, to: status })),
    ChosePriority: ({ priority }) =>
      changing(model, (task) => Task.Change.cases.Priority.make({ from: task.priority, to: priority })),
    ChoseAssignee: ({ memberId }) =>
      changing(model, (task) =>
        Task.Change.cases.Assignee.make({ from: task.assignee, to: Option.getOrNull(memberId) })
      ),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
