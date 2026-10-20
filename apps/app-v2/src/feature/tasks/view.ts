import { Task } from "@amends-dev/core/task"
import { choiceSelect, column, field, fieldGrid, notice } from "@amends-dev/design/control"
import { summary } from "@amends-dev/design/directory"
import type { IconName } from "@amends-dev/design/icon"
import { pane, paneColumn, paneEmpty } from "@amends-dev/design/pane"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { isOpen, pluralize } from "../../seen.ts"
import { statusChoices, taskTable } from "../../taskTable.ts"
import { TasksComposition, type TasksViewBuilder } from "./composition.ts"
import {
  type AssigneeFilter,
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

/** The choices of whom a task is assigned to. */
const assigneeChoices: ReadonlyArray<readonly [AssigneeFilter, string]> = [
  ["Anyone", "Anyone"],
  ["Me", "Me"],
  ["NoOne", "No one"]
]

/**
 * A destination as a main pane: the tasks it lists, latest active first, as a table with a column of groups, under
 * a search and the choices that narrow it, with how many it lists, or why it lists none.
 */
const destinationView = (destination: Destination, model: Model, { now }: ViewInputs, h: TasksViewBuilder): Html => {
  const narrowed = destination.statusChoices === undefined ? withAnyStatus(model) : model
  const shown = matching(narrowed, destination.listed(model.items))
  const none = isFiltered(narrowed) ? { title: "No tasks match", copy: "Try different filters." } : destination.nothing

  return pane(h, {
    variant: "main",
    label: destination.title,
    header: { title: destination.title, icon: destination.icon, subtitle: destination.subtitle },
    body: [
      paneColumn(
        h,
        [
          notice(h, model.notice),
          column(h, [
            fieldGrid(h, [
              field(
                h,
                {
                  id: "tasks-search",
                  label: "Search tasks",
                  type: "search",
                  value: model.filter.query,
                  onInput: (query) => Message.TypedQuery({ query }),
                  placeholder: "Search tasks…",
                  isAutofocus: false,
                  isLabelHidden: true
                },
                Option.none()
              ),
              choiceSelect(
                h,
                {
                  id: "tasks-assignee",
                  label: "Assignee",
                  choices: assigneeChoices,
                  value: model.filter.assignee,
                  onChange: (assignee) => Message.ChoseAssignee({ assignee })
                },
                { isLabelHidden: true }
              ),
              ...(destination.statusChoices === undefined
                ? []
                : [
                    choiceSelect(
                      h,
                      {
                        id: "tasks-status",
                        label: "Status",
                        choices: destination.statusChoices,
                        value: model.filter.status,
                        onChange: (status) => Message.ChoseStatus({ status })
                      },
                      { isLabelHidden: true }
                    )
                  ])
            ]),
            summary(h, { copy: destination.summary, count: pluralize(shown.length, "task", "tasks") }),
            ...(shown.length === 0
              ? [paneEmpty(h, { art: isFiltered(narrowed) ? "nothing-here" : "rest", ...none })]
              : taskTable(
                  h,
                  shown.map((item) => ({
                    ...item,
                    onClick: Message.ClickedTask({ groupId: item.thread.groupId, threadId: item.thread.id })
                  })),
                  { members: model.members, contacts: model.contacts, now, hasGroupColumn: true }
                ))
          ])
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
