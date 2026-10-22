import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { assigneeFilterOf, AssigneeMenu, StatusFilterMenu } from "../../control/taskFilter.ts"
import { TasksDefinition } from "./definition.ts"

export const StatusBinding = TasksDefinition.bindChild(StatusFilterMenu, {
  field: "statusMenu",
  init: { contextToArgs: () => [{ id: "tasks-status" }] },
  outMessage: {
    /** Choosing a status narrows the list to it. */
    fold: StatusFilterMenu.OutMessage.match({
      Selected: ({ value }) =>
        TasksDefinition.stepFields(() => ({ filter: (filter) => modifyFields(filter, { status: () => value }) })),
      Closed: () => TasksDefinition.stepNoop()
    })
  }
})

export const AssigneeBinding = TasksDefinition.bindChild(AssigneeMenu, {
  field: "assigneeMenu",
  init: { contextToArgs: () => [{ id: "tasks-assignee" }] },
  outMessage: {
    /** Choosing whom the tasks are assigned to narrows the list to them. */
    fold: AssigneeMenu.OutMessage.match({
      Selected: ({ value }) =>
        TasksDefinition.stepFields(() => ({
          filter: (filter) => modifyFields(filter, { assignee: () => assigneeFilterOf(value) })
        })),
      Closed: () => TasksDefinition.stepNoop()
    })
  }
})

export const TasksComposition = TasksDefinition.makeComposition({ bindings: [StatusBinding, AssigneeBinding] })
export type TasksViewBuilder = Block.ViewBuilderFor<typeof TasksComposition>
