/** Task filters, assignee choices, and the headless menus that select them. */

import { Task } from "@amends-dev/core/task"
import { MemberId } from "@amends-dev/core/workspace"
import * as Menu from "@foldkit/ui/menu"
import * as Schema from "effect/Schema"
import { defineTaggedUnion } from "foldkit/schema"

/** Which tasks a list keeps by where they stand: every one, or those in one status. */
export const TaskStatusFilter = Schema.Literals(["All", ...Task.Status.literals])
export type TaskStatusFilter = typeof TaskStatusFilter.Type

/**
 * Which tasks a list keeps by who they are assigned to: any, those assigned to no one, or those assigned to one member.
 */
export const AssigneeFilter = defineTaggedUnion({
  Anyone: {},
  Unassigned: {},
  Member: { memberId: MemberId.MemberId }
})
export type AssigneeFilter = typeof AssigneeFilter.Type

/**
 * What the assignee menu reports a choice by: `Anyone`, `Unassigned`, or `Member:` and the member's ID, which no
 * word of the menu can be mistaken for.
 */
export type AssigneeChoice = "Anyone" | "Unassigned" | `Member:${string}`

/** The menu that chooses the status a list is narrowed to. */
export const StatusFilterMenu = Menu.create<TaskStatusFilter>()

/** The menu that chooses whom tasks are assigned to: to narrow a list of them, or to assign one. */
export const AssigneeMenu = Menu.create<AssigneeChoice>()

const memberChoicePrefix = "Member:"

/** What the assignee menu calls the choice of `filter`. */
export const assigneeChoiceOf = (filter: AssigneeFilter): AssigneeChoice =>
  AssigneeFilter.match(filter, {
    Anyone: (): AssigneeChoice => "Anyone",
    Unassigned: (): AssigneeChoice => "Unassigned",
    Member: ({ memberId }): AssigneeChoice => `${memberChoicePrefix}${memberId}`
  })

/** The filter the assignee menu's `choice` stands for. */
export const assigneeFilterOf = (choice: AssigneeChoice): AssigneeFilter =>
  choice === "Anyone"
    ? AssigneeFilter.Anyone()
    : choice === "Unassigned"
      ? AssigneeFilter.Unassigned()
      : AssigneeFilter.Member({ memberId: MemberId.MemberId.make(choice.slice(memberChoicePrefix.length)) })

/**
 * Whom the assignee menu's `choice` assigns a task to: the member it names, or no one. Anyone, which only narrows a
 * list, is not a choice of whom to assign, and assigns no one.
 */
export const assigneeOfChoice = (choice: AssigneeChoice): MemberId.MemberId | null =>
  AssigneeFilter.match(assigneeFilterOf(choice), {
    Anyone: () => null,
    Unassigned: () => null,
    Member: ({ memberId }) => memberId
  })

/** Whether a task assigned to `assignee` is one `filter` keeps. */
export const isAssignedTo = (filter: AssigneeFilter, assignee: MemberId.MemberId | null): boolean =>
  AssigneeFilter.match(filter, {
    Anyone: () => true,
    Unassigned: () => assignee === null,
    Member: ({ memberId }) => assignee === memberId
  })
