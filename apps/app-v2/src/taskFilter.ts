/**
 * What a list of tasks is narrowed by besides the letters the person types: where each task stands and whom it is
 * assigned to, each chosen from a menu in the list's toolbar. A group's Tasks tab and the workspace's Triage and Tasks
 * share them.
 */

import { Task } from "@amends-dev/core/task"
import type { MemberId } from "@amends-dev/core/workspace"
import { choiceMenu, type MenuConfig } from "@amends-dev/design/menu"
import * as Menu from "@foldkit/ui/menu"
import * as Schema from "effect/Schema"
import type { Html, HtmlBuilder } from "foldkit/html"
import { statusLabel } from "./seen.ts"

/** Which tasks a list keeps by where they stand: every one, or those in one status. */
export const TaskStatusFilter = Schema.Literals(["All", ...Task.Status.literals])
export type TaskStatusFilter = typeof TaskStatusFilter.Type

/** Which tasks a list keeps by who they are assigned to: any, the person's own, or those assigned to no one. */
export const AssigneeFilter = Schema.Literals(["Anyone", "Me", "NoOne"])
export type AssigneeFilter = typeof AssigneeFilter.Type

/** The menu that chooses the status a list is narrowed to. */
export const StatusFilterMenu = Menu.create<TaskStatusFilter>()

/** The menu that chooses whom the tasks of a list are assigned to. */
export const AssigneeFilterMenu = Menu.create<AssigneeFilter>()

/** The statuses a list of tasks narrows to: any, then each of `statuses` as the person reads it. */
export const statusChoices = (
  statuses: ReadonlyArray<Task.Status>
): ReadonlyArray<readonly [TaskStatusFilter, string]> => [
  ["All", "Any status"],
  ...statuses.map((status) => [status, statusLabel[status]] as const)
]

/** The choices of whom a task is assigned to. */
export const assigneeChoices: ReadonlyArray<readonly [AssigneeFilter, string]> = [
  ["Anyone", "Anyone"],
  ["Me", "Me"],
  ["NoOne", "No one"]
]

/** Whether a task assigned to `assignee` is one the person, `self`, wants, by what they chose to see. */
export const isAssignedAs = (
  filter: AssigneeFilter,
  assignee: MemberId.MemberId | null,
  self: MemberId.MemberId
): boolean => (filter === "Anyone" ? true : filter === "Me" ? assignee === self : assignee === null)

/**
 * A menu that narrows a list by `kind`, "Status" or "Assignee": its button says the kind while the choice is
 * `unchosen`, which narrows nothing, and the choice itself after, and is named "{kind}: {choice}".
 */
const narrowingMenu = <Value extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    kind: string
    unchosen: Value
    choices: ReadonlyArray<readonly [Value, string]>
    value: Value
    embed: MenuConfig<Value>["embed"]
  }>
): Html => {
  const choice = config.choices.find(([value]) => value === config.value)?.[1] ?? config.value

  return choiceMenu(h, {
    choices: config.choices,
    value: config.value,
    ...(config.value === config.unchosen ? { text: config.kind } : {}),
    name: `${config.kind}: ${choice}`,
    embed: config.embed
  })
}

/** The menu that narrows a list to the tasks in a status, whose button says Status while it narrows to none. */
export const statusFilterMenu = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    choices: ReadonlyArray<readonly [TaskStatusFilter, string]>
    value: TaskStatusFilter
    embed: MenuConfig<TaskStatusFilter>["embed"]
  }>
): Html => narrowingMenu(h, { kind: "Status", unchosen: "All", ...config })

/**
 * The menu that narrows a list to the tasks assigned to someone, whose button says Assignee while it narrows to none.
 */
export const assigneeFilterMenu = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ value: AssigneeFilter; embed: MenuConfig<AssigneeFilter>["embed"] }>
): Html => narrowingMenu(h, { kind: "Assignee", unchosen: "Anyone", choices: assigneeChoices, ...config })
