/**
 * What the settings say, in the words of `@amends-dev/ui`: who a member is called, what the roster and a member's
 * access say of each, and what went wrong with an action for the place it was made.
 */

import { Assignment, Scope } from "@amends-dev/core/authorization"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import {
  type Failure,
  type MembersFilter,
  type Model,
  type Reason,
  roleName,
  type SettingsAction
} from "./definition.ts"

/** What a member is called, with "· You" after the name of the person themselves. */
export const displayName = (member: Member.Member, selfId: MemberId.MemberId): string =>
  member.id === selfId ? `${member.name} · You` : member.name

/** How a member's status reads in the roster and in their details. */
export const statusLabels: Readonly<Record<Member.Member["status"], string>> = { active: "Active", removed: "Removed" }

/** What the roster can be narrowed to, as the person reads each. */
export const filterChoices: ReadonlyArray<readonly [Member.Member["status"], string]> = [
  ["active", "Active members"],
  ["removed", "Removed members"]
]

/** What the roster says when it has no row to show: nothing matches the search, nobody left, or nobody is here. */
export const emptyRoster = (filter: MembersFilter): string => {
  const query = filter.query.trim()

  if (query !== "") {
    return `No ${filter.status === "removed" ? "removed " : ""}members match “${query}”.`
  }

  return filter.status === "removed" ? "Nobody has been removed from this workspace." : "No members yet."
}

/** What one of a member's assignments is of: the role's name, or the permission a direct grant gives. */
export const accessName = (model: Pick<Model, "roles">, assignment: Assignment.Assignment): string =>
  Assignment.Source.match(assignment.source, {
    Role: ({ roleId }) => roleName(model, roleId),
    Direct: ({ grant }) => grant.permission
  })

/** What one of a member's assignments reaches, and whether it still does: "Workspace · Active", "One item · Revoked". */
export const accessDetail = (assignment: Assignment.Assignment): string => {
  const scope = Scope.Scope.match(
    Assignment.Source.match(assignment.source, { Role: ({ scope }) => scope, Direct: ({ grant }) => grant.scope }),
    { Workspace: () => "Workspace", Target: () => "One item" }
  )

  return `${scope} · ${assignment.status === "active" ? "Active" : "Revoked"}`
}

const invalidMessages: Readonly<Record<Exclude<SettingsAction, "Read">, string>> = {
  Rename: "Use 1 to 80 characters, with no invisible ones.",
  RenameSelf: "Use 1 to 80 characters, with no invisible ones.",
  ChangeRole: "Choose a role."
}

const failedMessages: Readonly<Record<Exclude<SettingsAction, "Read">, string>> = {
  Rename: "The name could not be saved. Try again when the host is available.",
  RenameSelf: "Your name could not be saved. Try again when the host is available.",
  ChangeRole: "The role could not be saved. Try again when the host is available."
}

const goneMessages: Readonly<Record<Exclude<SettingsAction, "Read">, string>> = {
  Rename: "This workspace is no longer available to you.",
  RenameSelf: "This workspace is no longer available to you.",
  ChangeRole: "This member is no longer in the workspace. Refresh to see the latest."
}

const deniedMessage = "You no longer have permission to do this. Refresh to review your access."

const unreadableMessage = "The latest settings could not be loaded. Refresh to try again."

/** What went wrong, for the place the action was made. */
export const settingsMessage = ({ action, reason }: Failure): string => {
  if (action === "Read" || reason === "Outdated") {
    return unreadableMessage
  }

  const messageOfReason: Readonly<Record<Exclude<Reason, "Outdated">, string>> = {
    Invalid: invalidMessages[action],
    Failed: failedMessages[action],
    Denied: deniedMessage,
    Gone: goneMessages[action]
  }

  return messageOfReason[reason]
}

/** Whether the person must refresh before changing anything more: what they see is out of date. */
export const needsRefresh = (reason: Reason): boolean =>
  reason === "Denied" || reason === "Gone" || reason === "Outdated"
