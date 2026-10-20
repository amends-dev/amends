import { Task } from "@amends-dev/core/task"
import { notice, searchField } from "@amends-dev/design/control"
import { summary } from "@amends-dev/design/directory"
import type { IconName } from "@amends-dev/design/icon"
import { pane, paneColumn, paneEmpty, paneToolbar } from "@amends-dev/design/pane"
import type * as DateTime from "effect/DateTime"
import type { Html } from "foldkit/html"
import { isOpen, pluralize } from "../../seen.ts"
import { assigneeFilterMenu, statusChoices, statusFilterMenu } from "../../taskFilter.ts"
import { taskColumns, taskRows } from "../../taskTable.ts"
import { AssigneeBinding, StatusBinding, TasksComposition, type TasksViewBuilder } from "./composition.ts"
import {
  isFiltered,
  matching,
  Message,
  type Model,
  openTasks,
  type TaskItem,
  triageTasks,
  withAnyStatus
} from "./definition.ts"

/** The time now, which the ages of the tasks are counted from. */
export type ViewInputs = Readonly<{ now: DateTime.Utc }>

/**
 * What a destination lists and says: its title and the icon before it, the line under the title, the line over the
 * table, which of the tasks it lists, what it says while it lists none, and the choices of status it offers, when
 * it offers any.
 */
type Destination = Readonly<{
  title: string
  icon: IconName
  subtitle: string
  summary: string
  listed: (items: ReadonlyArray<TaskItem>) => ReadonlyArray<TaskItem>
  nothing: Readonly<{ title: string; copy: string }>
  statusChoices?: ReturnType<typeof statusChoices>
}>

const triageDestination: Destination = {
  title: "Triage",
  icon: "mark-triage",
  subtitle: "Tasks waiting for a decision.",
  summary: "Tasks in triage across your groups.",
  listed: triageTasks,
  nothing: { title: "Nothing to triage", copy: "Tasks you can see will be listed here." }
}

const tasksDestination: Destination = {
  title: "Tasks",
  icon: "mark-tasks",
  subtitle: "Every open task you can see.",
  summary: "Open tasks across your groups.",
  listed: openTasks,
  nothing: { title: "No open tasks", copy: "Tasks you can see will be listed here." },
  statusChoices: statusChoices(Task.Status.literals.filter(isOpen))
}

/**
 * A destination as a main pane: the tasks it lists, latest active first, as a table with a column of groups, under
 * a toolbar of a search and the menus that narrow it, with how many it lists, or why it lists none.
 */
const destinationView = (destination: Destination, model: Model, { now }: ViewInputs, h: TasksViewBuilder): Html => {
  const narrowed = destination.statusChoices === undefined ? withAnyStatus(model) : model
  const shown = matching(narrowed, destination.listed(model.items))
  const none = isFiltered(narrowed) ? { title: "No tasks match", copy: "Try different filters." } : destination.nothing

  return pane(h, {
    variant: "main",
    label: destination.title,
    header: { title: destination.title, icon: destination.icon, subtitle: destination.subtitle },
    toolbar: [
      paneToolbar(h, {
        start: [
          searchField(h, {
            id: "tasks-search",
            label: "Search tasks",
            placeholder: "Search tasks…",
            value: model.filter.query,
            onInput: (query) => Message.TypedQuery({ query })
          }),
          assigneeFilterMenu(h, {
            value: model.filter.assignee,
            members: model.members,
            embed: (viewInputs) =>
              h.block(AssigneeBinding.embedView({ slotId: "tasks-assignee", model: model.assigneeMenu, viewInputs }))
          }),
          ...(destination.statusChoices === undefined
            ? []
            : [
                statusFilterMenu(h, {
                  choices: destination.statusChoices,
                  value: model.filter.status,
                  embed: (viewInputs) =>
                    h.block(StatusBinding.embedView({ slotId: "tasks-status", model: model.statusMenu, viewInputs }))
                })
              ])
        ]
      }),
      summary(h, { copy: destination.summary, count: pluralize(shown.length, "task", "tasks") }),
      ...(shown.length === 0 ? [] : [taskColumns(h, { hasGroupColumn: true })])
    ],
    body: [
      paneColumn(
        h,
        [
          notice(h, model.notice),
          shown.length === 0
            ? paneEmpty(h, { art: isFiltered(narrowed) ? "nothing-here" : "rest", ...none })
            : taskRows(
                h,
                shown.map((item) => ({
                  ...item,
                  onClick: Message.ClickedTask({ groupId: item.thread.groupId, threadId: item.thread.id })
                })),
                { members: model.members, contacts: model.contacts, now, hasGroupColumn: true }
              )
        ],
        { isWide: true }
      )
    ]
  })
}

/** The tasks in triage, which wait for someone to decide on them. */
export const triageView = TasksComposition.makeView.withInputs<ViewInputs>((model, inputs, h) =>
  destinationView(triageDestination, model, inputs, h)
)

/** Every task that is neither done nor dismissed. */
export const tasksView = TasksComposition.makeView.withInputs<ViewInputs>((model, inputs, h) =>
  destinationView(tasksDestination, model, inputs, h)
)
