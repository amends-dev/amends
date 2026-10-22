/** Shared group names and membership eligibility. */

import type { Group } from "@amends-dev/core/group"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import { namesOf } from "./members.ts"

/** A group's name: a team's own, or a conversation's other members than `self`, by their names. */
export const groupName = (
  group: Group.Group,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string =>
  group.kind === "Team"
    ? group.name
    : namesOf(
        members,
        group.memberIds.filter((id) => id !== self)
      )

/** Where `group` is, as a line says it: a team as `#` and its name, a conversation by the others in it. */
export const placeName = (
  group: Group.Group,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string => (group.kind === "Team" ? `#${group.name}` : groupName(group, members, self))

/** Whether anyone in the workspace may join `group`: a public team. */
export const isJoinable = (group: Group.Group): boolean => group.kind === "Team" && group.visibility === "Public"
