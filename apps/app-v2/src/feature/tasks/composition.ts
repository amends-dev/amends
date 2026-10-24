import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { assigneeFilterOf, AssigneeMenu, StatusFilterMenu } from "../../control/taskFilter.ts"
import { TasksDefinition } from "./definition.ts"

export const StatusBinding = TasksDefinition.makeBinding(StatusFilterMenu, {
  field: "statusMenu",
  init: { contextToArgs: () => [{ id: "tasks-status" }] }
}).withOutMessagePolicy({
  /** Choosing a status narrows the list to it. */
  fold: StatusFilterMenu.OutMessage.match({
    Selected: ({ value }) =>
      TasksDefinition.makeFieldsStep(() => ({ filter: (filter) => modifyFields(filter, { status: () => value }) })),
    Closed: () => TasksDefinition.makeNoopStep()
  })
})

export const AssigneeBinding = TasksDefinition.makeBinding(AssigneeMenu, {
  field: "assigneeMenu",
  init: { contextToArgs: () => [{ id: "tasks-assignee" }] }
}).withOutMessagePolicy({
  /** Choosing whom the tasks are assigned to narrows the list to them. */
  fold: AssigneeMenu.OutMessage.match({
    Selected: ({ value }) =>
      TasksDefinition.makeFieldsStep(() => ({
        filter: (filter) => modifyFields(filter, { assignee: () => assigneeFilterOf(value) })
      })),
    Closed: () => TasksDefinition.makeNoopStep()
  })
})

export const TasksComposition = TasksDefinition.makeComposition({ bindings: [StatusBinding, AssigneeBinding] })
export type TasksViewBuilder = Block.ViewBuilderFor<typeof TasksComposition>
