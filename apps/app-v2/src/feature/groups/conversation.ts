/**
 * Who a conversation is with, as its row in the sidebar draws it: with one member, their mark in their tone; with
 * several, a mark of their own.
 */

import type { Group } from "@amends-dev/core/group"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import type { MarkContent } from "@amends-dev/design/mark"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import { initials, memberMark, memberName } from "../../seen.ts"

/** The members of `group` other than the person `self`, by their IDs. */
export const othersIn = (group: Group.Direct, self: MemberId.MemberId): ReadonlyArray<MemberId.MemberId> =>
  group.memberIds.filter((memberId) => memberId !== self)

/** The member `group` is with, when it is with one: none for a conversation with several. */
export const soleOtherIn = (group: Group.Direct, self: MemberId.MemberId): Option.Option<MemberId.MemberId> => {
  const others = othersIn(group, self)

  return others.length === 1 ? Array.head(others) : Option.none()
}

/** The uppercase first letter of the first word of `name`. */
const firstLetter = (name: string): string => Option.getOrElse(Array.head(Array.fromIterable(initials(name))), () => "")

/**
 * The mark of `group`, a conversation. With one other member it is theirs, in their tone, the agent's for an agent,
 * or the letters of their ID until the workspace's `members` are read. With several it is the first letters of the
 * names of the first two, which no one's tone is on: the row's label names all of them.
 */
export const conversationMark = (
  members: ReadonlyArray<Member.Member>,
  group: Group.Direct,
  self: MemberId.MemberId
): MarkContent =>
  Option.match(soleOtherIn(group, self), {
    onSome: (memberId) => {
      const member = members.find(({ id }) => id === memberId)

      return member === undefined ? { text: initials(memberId) } : memberMark(member)
    },
    onNone: () => ({
      text: othersIn(group, self)
        .slice(0, 2)
        .map((memberId) => firstLetter(memberName(members, memberId)))
        .join("")
    })
  })
