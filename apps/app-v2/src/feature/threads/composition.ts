import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { assigneeFilterOf, AssigneeMenu, StatusFilterMenu } from "../../control/taskFilter.ts"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { StartThread } from "./command.ts"
import { type Model, OutMessage, TaskSortMenu, ThreadsDefinition } from "./definition.ts"

/**
 * What the person sends from the composer starts a thread, one that tracks a task, in triage, on the Tasks tab;
 * their typing changes nothing here, and a slash command they run is for whoever holds the threads.
 */
const foldComposerOutMessage = ComposerBlock.OutMessage.match({
  ChangedText: () => ThreadsDefinition.makeNoopStep(),
  RanSlashCommand: () => ThreadsDefinition.makeNoopStep(),
  SubmittedText: ({ text }) =>
    ThreadsDefinition.makeStep((model: Model) => ({
      model,
      commands: [
        StartThread({
          workspaceId: model.workspaceId,
          memberId: model.memberId,
          groupId: model.groupId,
          text,
          task: model.tab === "Tasks" ? Option.some({}) : Option.none()
        })
      ]
    }))
})

/** A slash command the person ran in the composer is reported as it is. */
const forwardComposerOutMessage = ComposerBlock.OutMessage.match({
  ChangedText: () => undefined,
  SubmittedText: () => undefined,
  RanSlashCommand: ({ command }) => OutMessage.RanSlashCommand({ command })
})

export const ComposerBinding = ThreadsDefinition.makeBinding(ComposerBlock, {
  field: "composer",
  init: {
    contextToArgs: ({ workspaceId, memberId, groupId }) => [
      workspaceId,
      memberId,
      Drafts.Place.cases.Thread.make({ groupId })
    ]
  }
}).withOutMessagePolicy({ forward: forwardComposerOutMessage, fold: foldComposerOutMessage })

export const StatusBinding = ThreadsDefinition.makeBinding(StatusFilterMenu, {
  field: "statusMenu",
  init: { contextToArgs: () => [{ id: "group-tasks-status" }] }
}).withOutMessagePolicy({
  /** Choosing a status narrows the Tasks tab to it. */
  fold: StatusFilterMenu.OutMessage.match({
    Selected: ({ value }) =>
      ThreadsDefinition.makeFieldsStep(() => ({
        taskFilter: (filter) => modifyFields(filter, { status: () => value })
      })),
    Closed: () => ThreadsDefinition.makeNoopStep()
  })
})

export const AssigneeBinding = ThreadsDefinition.makeBinding(AssigneeMenu, {
  field: "assigneeMenu",
  init: { contextToArgs: () => [{ id: "group-tasks-assignee" }] }
}).withOutMessagePolicy({
  /** Choosing whom the tasks are assigned to narrows the Tasks tab to them. */
  fold: AssigneeMenu.OutMessage.match({
    Selected: ({ value }) =>
      ThreadsDefinition.makeFieldsStep(() => ({
        taskFilter: (filter) => modifyFields(filter, { assignee: () => assigneeFilterOf(value) })
      })),
    Closed: () => ThreadsDefinition.makeNoopStep()
  })
})

export const SortBinding = ThreadsDefinition.makeBinding(TaskSortMenu, {
  field: "sortMenu",
  init: { contextToArgs: () => [{ id: "group-tasks-sort" }] }
}).withOutMessagePolicy({
  /** Choosing an order orders the Tasks tab by it. */
  fold: TaskSortMenu.OutMessage.match({
    Selected: ({ value }) => ThreadsDefinition.makeFieldsStep(() => ({ taskSort: () => value })),
    Closed: () => ThreadsDefinition.makeNoopStep()
  })
})

export const ThreadsComposition = ThreadsDefinition.makeComposition({
  bindings: [ComposerBinding, StatusBinding, AssigneeBinding, SortBinding]
})
export type ThreadsViewBuilder = Block.ViewBuilderFor<typeof ThreadsComposition>
