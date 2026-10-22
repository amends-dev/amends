import { Task } from "@amends-dev/core/task"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { assigneeOfChoice, AssigneeMenu } from "../../control/taskFilter.ts"
import { UpdateTask } from "./command.ts"
import { type Model, PriorityMenu, StatusMenu, TaskDefinition } from "./definition.ts"

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

export const StatusBinding = TaskDefinition.bindChild(StatusMenu, {
  field: "statusMenu",
  init: { contextToArgs: () => [{ id: "task-status" }] },
  outMessage: {
    /** Choosing a status changes the task's, from the one the person saw. */
    fold: StatusMenu.OutMessage.match({
      Selected: ({ value }) =>
        TaskDefinition.step((model: Model) =>
          changing(model, (task) => Task.Change.cases.Status.make({ from: task.status, to: value }))
        ),
      Closed: () => TaskDefinition.stepNoop()
    })
  }
})

export const PriorityBinding = TaskDefinition.bindChild(PriorityMenu, {
  field: "priorityMenu",
  init: { contextToArgs: () => [{ id: "task-priority" }] },
  outMessage: {
    /** Choosing a priority changes the task's, from the one the person saw. */
    fold: PriorityMenu.OutMessage.match({
      Selected: ({ value }) =>
        TaskDefinition.step((model: Model) =>
          changing(model, (task) => Task.Change.cases.Priority.make({ from: task.priority, to: value }))
        ),
      Closed: () => TaskDefinition.stepNoop()
    })
  }
})

export const AssigneeBinding = TaskDefinition.bindChild(AssigneeMenu, {
  field: "assigneeMenu",
  init: { contextToArgs: () => [{ id: "task-assignee" }] },
  outMessage: {
    /** Choosing a person assigns the task to them, and Unassigned to no one, from the assignee the person saw. */
    fold: AssigneeMenu.OutMessage.match({
      Selected: ({ value }) =>
        TaskDefinition.step((model: Model) =>
          changing(model, (task) =>
            Task.Change.cases.Assignee.make({ from: task.assignee, to: assigneeOfChoice(value) })
          )
        ),
      Closed: () => TaskDefinition.stepNoop()
    })
  }
})

export const TaskComposition = TaskDefinition.makeComposition({
  bindings: [StatusBinding, PriorityBinding, AssigneeBinding]
})
export type TaskViewBuilder = Block.ViewBuilderFor<typeof TaskComposition>
