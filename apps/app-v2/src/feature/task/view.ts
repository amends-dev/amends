import { Task, TaskPermissions } from "@amends-dev/core/task"
import { button, column, hint, notice } from "@amends-dev/design/control"
import { properties, property, propertyIcon, propertyValue } from "@amends-dev/design/details"
import { mark, taskStatus } from "@amends-dev/design/mark"
import { type PropertyChoice, propertyMenu } from "@amends-dev/design/menu"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { AssigneeFilter, assigneeChoiceOf } from "../../control/taskFilter.ts"
import { memberName } from "../../data/members.ts"
import { groupTarget, may, threadTarget } from "../../data/permissions.ts"
import { memberMark } from "../../view/members.ts"
import { assigneeProperties } from "../../view/taskFilter.ts"
import { priorityLabel, statusLabel, statusShape } from "../../view/tasks.ts"
import { TaskBlock } from "./block.ts"
import { AssigneeBinding, PriorityBinding, StatusBinding, type TaskViewBuilder } from "./composition.ts"
import { assignable, Message, type Model, type ThreadTask } from "./definition.ts"

/** The statuses a task can be changed to, each with the drawing that says it. */
const statusProperties: ReadonlyArray<PropertyChoice<Task.Status>> = Task.Status.literals.map((status) => ({
  value: status,
  label: statusLabel[status],
  taskStatus: statusShape[status]
}))

/** The priorities a task can be changed to. */
const priorityProperties: ReadonlyArray<PropertyChoice<Task.Priority>> = Task.Priority.literals.map((priority) => ({
  value: priority,
  label: priorityLabel[priority]
}))

/** The assignee menu's name for who `task` is assigned to. */
const assigneeChoiceOfTask = ({ assignee }: Task.Task) =>
  assigneeChoiceOf(assignee === null ? AssigneeFilter.Unassigned() : AssigneeFilter.Member({ memberId: assignee }))

/** The task's status, assignee, and priority as quiet menus under their captions, for someone who may change them. */
const changeableProperties = (task: Task.Task, model: Model, h: TaskViewBuilder): Html =>
  properties(h, {
    label: "Properties",
    children: [
      propertyMenu(h, {
        caption: "Status",
        choices: statusProperties,
        value: task.status,
        embed: (viewInputs) =>
          h.block(StatusBinding.embedView({ slotId: "task-status", model: model.statusMenu, viewInputs }))
      }),
      propertyMenu(h, {
        caption: "Assignee",
        choices: assigneeProperties(assignable(model), model.members, task.assignee),
        value: assigneeChoiceOfTask(task),
        embed: (viewInputs) =>
          h.block(AssigneeBinding.embedView({ slotId: "task-assignee", model: model.assigneeMenu, viewInputs }))
      }),
      propertyMenu(h, {
        caption: "Priority",
        choices: priorityProperties,
        value: task.priority,
        embed: (viewInputs) =>
          h.block(PriorityBinding.embedView({ slotId: "task-priority", model: model.priorityMenu, viewInputs }))
      })
    ]
  })

/** Who the task is assigned to, as a property that is read: their mark and name, or the people icon and Unassigned. */
const assigneeValue = ({ assignee }: Task.Task, model: Model, h: TaskViewBuilder): Html => {
  if (assignee === null) {
    return propertyValue(h, { before: propertyIcon(h, "users"), text: "Unassigned" })
  }

  const member = model.members.find(({ id }) => id === assignee)

  return propertyValue(h, {
    ...(member === undefined ? {} : { before: mark(h, { ...memberMark(member), size: "sm" }) }),
    text: memberName(model.members, assignee)
  })
}

/** The task's status, assignee, and priority as they read, for someone who may not change them. */
const readProperties = (task: Task.Task, model: Model, h: TaskViewBuilder): Html =>
  properties(h, {
    label: "Properties",
    children: [
      property(h, {
        caption: "Status",
        children: [
          propertyValue(h, { before: taskStatus(h, statusShape[task.status]), text: statusLabel[task.status] })
        ]
      }),
      property(h, { caption: "Assignee", children: [assigneeValue(task, model, h)] }),
      property(h, { caption: "Priority", children: [propertyValue(h, { text: priorityLabel[task.priority] })] })
    ]
  })

/**
 * The task's status, assignee, and priority, as the person changes them, or as they read them, with a line while a
 * change is on its way.
 */
const taskView = ({ task, pending }: ThreadTask, model: Model, h: TaskViewBuilder): Html =>
  column(h, [
    notice(h, model.notice),
    may(model.grants, TaskPermissions.Update, threadTarget(model.workspaceId, model.threadId))
      ? changeableProperties(task, model, h)
      : readProperties(task, model, h),
    pending ? hint(h, "Sending…") : h.empty
  ])

/** The task the thread tracks, or making it one, when the person may create tasks in its group. */
export const view = TaskBlock.makeView((model, h) =>
  Option.match(model.task, {
    onSome: (item) => taskView(item, model, h),
    onNone: () =>
      Option.match(model.groupId, {
        onNone: () => h.empty,
        onSome: (groupId) =>
          may(model.grants, TaskPermissions.Create, groupTarget(model.workspaceId, groupId))
            ? column(h, [
                notice(h, model.notice),
                button(h, "Make it a task", Message.ClickedMakeTask(), { variant: "secondary" })
              ])
            : h.empty
      })
  })
)
