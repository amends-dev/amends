/**
 * What a list of tasks is narrowed by besides the letters the person types: where each task stands and whom it is
 * assigned to, each chosen from a menu in the list's toolbar. A group's Tasks tab and the workspace's Triage and Tasks
 * share them.
 */

import { Task } from "@amends-dev/core/task"
import { type Member, MemberId } from "@amends-dev/core/workspace"
import { type ChoiceMenuChoice, choiceMenu, type MenuConfig } from "@amends-dev/design/menu"
import * as Menu from "@foldkit/ui/menu"
import * as Schema from "effect/Schema"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineTaggedUnion } from "foldkit/schema"
import { memberMark, memberName, statusLabel } from "./seen.ts"

/** Which tasks a list keeps by where they stand: every one, or those in one status. */
export const TaskStatusFilter = Schema.Literals(["All", ...Task.Status.literals])
export type TaskStatusFilter = typeof TaskStatusFilter.Type

/** Which tasks a list keeps by who they are assigned to: any, those assigned to no one, or those assigned to one member. */
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

/** The menu that chooses whom the tasks of a list are assigned to. */
export const AssigneeFilterMenu = Menu.create<AssigneeChoice>()

/** The statuses a list of tasks narrows to: any, then each of `statuses` as the person reads it. */
export const statusChoices = (
  statuses: ReadonlyArray<Task.Status>
): ReadonlyArray<readonly [TaskStatusFilter, string]> => [
  ["All", "Any status"],
  ...statuses.map((status) => [status, statusLabel[status]] as const)
]

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

const byName = (left: Member.Member, right: Member.Member): number =>
  left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1)

/**
 * The choices of whom a task is assigned to: Anyone, Unassigned, then each member still in the workspace, by name,
 * with their mark.
 */
export const assigneeChoices = (
  members: ReadonlyArray<Member.Member>
): ReadonlyArray<ChoiceMenuChoice<AssigneeChoice>> => [
  ["Anyone", "Anyone"],
  ["Unassigned", "Unassigned"],
  ...members
    .filter((member) => member.status === "active")
    .toSorted(byName)
    .map(
      (member) =>
        [assigneeChoiceOf(AssigneeFilter.Member({ memberId: member.id })), member.name, memberMark(member)] as const
    )
]

/** Whether a task assigned to `assignee` is one `filter` keeps. */
export const isAssignedTo = (filter: AssigneeFilter, assignee: MemberId.MemberId | null): boolean =>
  AssigneeFilter.match(filter, {
    Anyone: () => true,
    Unassigned: () => assignee === null,
    Member: ({ memberId }) => assignee === memberId
  })

/**
 * A menu that narrows a list by `kind`, "Status" or "Assignee": its button says the kind while the choice is
 * `unchosen`, which narrows nothing, and the choice's `label` after, and is named "{kind}: {label}".
 */
const narrowingMenu = <Value extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    kind: string
    unchosen: Value
    choices: ReadonlyArray<ChoiceMenuChoice<Value>>
    value: Value
    label: string
    embed: MenuConfig<Value>["embed"]
  }>
): Html =>
  choiceMenu(h, {
    choices: config.choices,
    value: config.value,
    text: config.value === config.unchosen ? config.kind : config.label,
    name: `${config.kind}: ${config.label}`,
    embed: config.embed
  })

/** The menu that narrows a list to the tasks in a status, whose button says Status while it narrows to none. */
export const statusFilterMenu = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    choices: ReadonlyArray<readonly [TaskStatusFilter, string]>
    value: TaskStatusFilter
    embed: MenuConfig<TaskStatusFilter>["embed"]
  }>
): Html =>
  narrowingMenu(h, {
    kind: "Status",
    unchosen: "All",
    label: config.choices.find(([value]) => value === config.value)?.[1] ?? config.value,
    ...config
  })

/**
 * The menu that narrows a list to the tasks assigned to someone, or to no one, whose button says Assignee while it
 * narrows to none, Unassigned for those assigned to no one, and the member's name for those assigned to them. It lists
 * `members`, those still in the workspace, with their marks.
 */
export const assigneeFilterMenu = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    value: AssigneeFilter
    members: ReadonlyArray<Member.Member>
    embed: MenuConfig<AssigneeChoice>["embed"]
  }>
): Html =>
  narrowingMenu(h, {
    kind: "Assignee",
    unchosen: "Anyone",
    choices: assigneeChoices(config.members),
    value: assigneeChoiceOf(config.value),
    label: AssigneeFilter.match(config.value, {
      Anyone: () => "Anyone",
      Unassigned: () => "Unassigned",
      Member: ({ memberId }) => memberName(config.members, memberId)
    }),
    embed: config.embed
  })
