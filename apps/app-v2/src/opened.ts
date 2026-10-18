/**
 * What the open workspace's records tell its views: what a member and a group are called, and
 * whether the person belongs to a group.
 */

import type { Group } from "@amends-dev/core/group"
import type { Member } from "@amends-dev/core/workspace"
import type { Opened } from "./model.ts"

/** A member by their name here. */
export const memberName = (memberId: Member.Member["id"], opened: Opened) =>
  opened.members.find(({ member }) => member.id === memberId)?.member.name ?? "Someone"

/** A group's name: a team's own, or the person's direct group's other members, by their names here. */
export const groupName = (group: Group.Group, opened: Opened) =>
  "name" in group
    ? group.name
    : group.memberIds
        .filter((id) => id !== opened.memberId)
        .map((id) => memberName(id, opened))
        .join(", ")

/**
 * Whether the person belongs to `groupId`: whether it is a direct group of theirs, whose members are
 * fixed, or they hold an active membership of it, or are being admitted.
 */
export const belongsTo = (opened: Opened, groupId: Group.Group["id"]) =>
  opened.groups.some(
    ({ group }) => group.id === groupId && group.kind === "Direct" && group.memberIds.includes(opened.memberId)
  ) ||
  opened.memberships.some(
    ({ membership }) =>
      membership.groupId === groupId && membership.memberId === opened.memberId && membership.status === "active"
  )
