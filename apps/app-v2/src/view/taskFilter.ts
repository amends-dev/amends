/** Labels, marks, and renderers for task filter and assignee menus. */

import type { Task } from "@amends-dev/core/task"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import { type ChoiceMenuChoice, choiceMenu, type MenuConfig, type PropertyChoice } from "@amends-dev/design/menu"
import type { Html, HtmlBuilder } from "foldkit/html"
import { AssigneeFilter, assigneeChoiceOf, type AssigneeChoice, type TaskStatusFilter } from "../control/taskFilter.ts"
import { memberName } from "../data/members.ts"
import { memberMark } from "./members.ts"
import { statusLabel } from "./tasks.ts"

/** The statuses a list of tasks narrows to: any, then each of `statuses` as the person reads it. */
export const statusChoices = (
  statuses: ReadonlyArray<Task.Status>
): ReadonlyArray<readonly [TaskStatusFilter, string]> => [
  ["All", "Any status"],
  ...statuses.map((status) => [status, statusLabel[status]] as const)
]

const byName = (left: Member.Member, right: Member.Member): number =>
  left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1)

/** The members the assignee menu lists: those still in the workspace, by name. */
const listedMembers = (members: ReadonlyArray<Member.Member>): ReadonlyArray<Member.Member> =>
  members.filter((member) => member.status === "active").toSorted(byName)

/**
 * The choices of whom a task is assigned to: Anyone, Unassigned, then each member still in the workspace, by name,
 * with their mark.
 */
export const assigneeChoices = (
  members: ReadonlyArray<Member.Member>
): ReadonlyArray<ChoiceMenuChoice<AssigneeChoice>> => [
  ["Anyone", "Anyone"],
  ["Unassigned", "Unassigned"],
  ...listedMembers(members).map(
    (member) =>
      [assigneeChoiceOf(AssigneeFilter.Member({ memberId: member.id })), member.name, memberMark(member)] as const
  )
]

/**
 * The choices of whom one task is assigned to, as a property of the task: Unassigned, which the button draws as the
 * people icon, then each of `assignable` still in the workspace, by name, with their mark. The `assignee`, if there is
 * one, is always among them, by the name `members` give them, though they have left the group or the person may not
 * use them, so that the button says who the task is assigned to.
 */
export const assigneeProperties = (
  assignable: ReadonlyArray<Member.Member>,
  members: ReadonlyArray<Member.Member>,
  assignee: MemberId.MemberId | null
): ReadonlyArray<PropertyChoice<AssigneeChoice>> => {
  const choiceOf = (memberId: MemberId.MemberId): PropertyChoice<AssigneeChoice> => {
    const member = members.find(({ id }) => id === memberId)

    return {
      value: assigneeChoiceOf(AssigneeFilter.Member({ memberId })),
      label: memberName(members, memberId),
      ...(member === undefined ? {} : { mark: memberMark(member) })
    }
  }
  const listed = listedMembers(assignable)

  return [
    { value: "Unassigned", label: "Unassigned", buttonIcon: "users" },
    ...listed.map(({ id }) => choiceOf(id)),
    ...(assignee === null || listed.some(({ id }) => id === assignee) ? [] : [choiceOf(assignee)])
  ]
}

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
