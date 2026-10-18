/**
 * What the open workspace's records tell its views: what a member and a group are called, whether
 * the person belongs to a group, and who is present and where they type.
 */

import type { Group } from "@amends-dev/core/group"
import type { Thread } from "@amends-dev/core/thread"
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

/** Whether `memberId` has the workspace open now. */
export const isPresent = (opened: Opened, memberId: Member.Member["id"]) =>
  opened.present.some((present) => present.memberId === memberId)

/** Who other than the person types in `threadId` now, by their names here. */
export const typingIn = (opened: Opened, threadId: Thread.Thread["id"]) =>
  opened.present
    .filter((present) => present.typingIn === threadId && present.memberId !== opened.memberId)
    .map(({ memberId }) => memberName(memberId, opened))
