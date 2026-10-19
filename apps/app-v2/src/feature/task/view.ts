import { Task, TaskPermissions } from "@amends-dev/core/task"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { button, choiceSelect, errorView, memberSelect, sending } from "../../controls.ts"
import { groupTarget, may, threadTarget } from "../../permissions.ts"
import { memberName, priorityLabel, statusLabel } from "../../seen.ts"
import { TaskComposition, type TaskViewBuilder } from "./composition.ts"
import { assignable, Message, type Model, type TaskItem } from "./definition.ts"

/** The task's status, priority, and assignee, as the person changes them, or as they read them. */
const taskView = ({ task, pending }: TaskItem, model: Model, h: TaskViewBuilder): Html =>
  h.section(
    [h.AriaLabel("Task")],
    [
      h.p([], [h.strong([], ["Task"]), sending(pending, h)]),
      errorView(model.notice, h),
      may(model.grants, TaskPermissions.Update, threadTarget(model.workspaceId, model.threadId))
        ? h.div(
            [],
            [
              choiceSelect(h, {
                id: "task-status",
                label: "Status",
                choices: Task.Status.literals.map((status) => [status, statusLabel[status]] as const),
                value: task.status,
                onChange: (status) => Message.ChoseStatus({ status })
              }),
              choiceSelect(h, {
                id: "task-priority",
                label: "Priority",
                choices: Task.Priority.literals.map((priority) => [priority, priorityLabel[priority]] as const),
                value: task.priority,
                onChange: (priority) => Message.ChosePriority({ priority })
              }),
              memberSelect(h, {
                id: "task-assignee",
                label: "Assignee",
                none: "No one",
                members: assignable(model),
                value: Option.fromNullOr(task.assignee),
                onChange: (memberId) => Message.ChoseAssignee({ memberId })
              })
            ]
          )
        : h.p(
            [],
            [
              [
                statusLabel[task.status],
                priorityLabel[task.priority],
                task.assignee === null
                  ? "Assigned to no one"
                  : `Assigned to ${memberName(model.members, task.assignee)}`
              ].join(" · ")
            ]
          )
    ]
  )

/** The task the thread tracks, or making it one, when the person may create tasks in its group. */
export const view = TaskComposition.makeView((model, h) =>
  Option.match(model.task, {
    onSome: (item) => taskView(item, model, h),
    onNone: () =>
      Option.match(model.groupId, {
        onNone: () => h.empty,
        onSome: (groupId) =>
          may(model.grants, TaskPermissions.Create, groupTarget(model.workspaceId, groupId))
            ? h.div([], [errorView(model.notice, h), button(h, "Make it a task", Message.ClickedMakeTask())])
            : h.empty
      })
  })
)
