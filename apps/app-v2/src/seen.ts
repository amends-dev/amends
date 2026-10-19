/**
 * What the person sees of the workspace's records: what a member and a group are called, and
 * whether anyone may join a group.
 */

import type { Group } from "@amends-dev/core/group"
import type { Member, MemberId } from "@amends-dev/core/workspace"

/** `memberId` by their name among `members`, or their ID until names are read. */
export const memberName = (members: ReadonlyArray<Member.Member>, memberId: MemberId.MemberId): string =>
  members.find((member) => member.id === memberId)?.name ?? memberId

/** A group's name: a team's own, or a conversation's other members than `self`, by their names. */
export const groupName = (
  group: Group.Group,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string =>
  group.kind === "Team"
    ? group.name
    : group.memberIds
        .filter((id) => id !== self)
        .map((id) => memberName(members, id))
        .join(", ")

/** Whether anyone in the workspace may join `group`: a public team. */
export const isJoinable = (group: Group.Group): boolean => group.kind === "Team" && group.visibility === "Public"
