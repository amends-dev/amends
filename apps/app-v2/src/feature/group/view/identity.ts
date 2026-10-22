/** The group name and the marks of its members. */

import type { MemberId } from "@amends-dev/core/workspace"
import type { MarkContent } from "@amends-dev/design/mark"
import * as Option from "effect/Option"
import { groupName } from "../../../data/groups.ts"
import { initials, memberMark } from "../../../view/members.ts"
import type { Model } from "../definition.ts"

/** The group's name: a team's own, or a conversation's other members, once the group is read. */
export const nameOf = (model: Model): string =>
  Option.match(model.group, {
    onNone: () => "A group",
    onSome: ({ group }) => groupName(group, model.members, model.memberId)
  })

/** `memberId`'s mark in their tone, or their initials until the workspace's members are read. */
export const markOfMember = (model: Model, memberId: MemberId.MemberId): MarkContent => {
  const member = model.members.find(({ id }) => id === memberId)

  return member === undefined ? { text: initials(memberId) } : memberMark(member)
}
