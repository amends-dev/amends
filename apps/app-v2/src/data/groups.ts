/** Group names, membership eligibility, and conversation lookup. */

import { Group } from "@amends-dev/core/group"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
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

/** The members of `group` other than the person `self`, by their IDs. */
export const othersIn = (group: Group.Direct, self: MemberId.MemberId): ReadonlyArray<MemberId.MemberId> =>
  group.memberIds.filter((memberId) => memberId !== self)

/** The conversation among `groups` of the person `self` with exactly the members `others`, when there is one. */
export const conversationAmong = (
  groups: ReadonlyArray<Group.Group>,
  self: MemberId.MemberId,
  others: ReadonlyArray<MemberId.MemberId>
): Option.Option<Group.Direct> => {
  const wanted = Group.directKey([self, ...others])

  return Array.findFirst(
    groups,
    (group): group is Group.Direct => group.kind === "Direct" && Group.directKey(group.memberIds) === wanted
  )
}

/** The member `group` is with, when it is with one: none for a conversation with several. */
export const soleOtherIn = (group: Group.Direct, self: MemberId.MemberId): Option.Option<MemberId.MemberId> => {
  const others = othersIn(group, self)

  return others.length === 1 ? Array.head(others) : Option.none()
}
