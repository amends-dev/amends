/** Names and marks for members and message authors. */

import type { Contact } from "@amends-dev/core/channel"
import { ThreadMessage } from "@amends-dev/core/thread"
import type { Member } from "@amends-dev/core/workspace"
import type { MarkContent } from "@amends-dev/design/mark"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import { isAgent } from "../data/members.ts"
import { authorName } from "../data/messages.ts"

/** The uppercase first letters of the first two words of `name`, or of its first word alone. */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.fromIterable(word).at(0) ?? "")
    .join("")
    .toUpperCase()

/** A member's mark: their initials, on the agent's tone for an agent. */
export const memberMark = (member: Member.Member): MarkContent => ({
  text: initials(member.name),
  tone: isAgent(member) ? "lilac" : "neutral"
})

/**
 * `author`'s mark: a member's own, on the agent's tone for an agent, or the letters of the name a channel's contact
 * gave, or of the name a member without a record here is called.
 */
export const authorMark = (
  author: ThreadMessage.Author,
  members: ReadonlyArray<Member.Member>,
  contacts: ReadonlyArray<Contact.Contact>
): MarkContent => {
  const maybeMember = ThreadMessage.Author.match(author, {
    Member: ({ memberId }) => Option.fromUndefinedOr(members.find((member) => member.id === memberId)),
    Contact: () => Option.none<Member.Member>()
  })

  return Option.match(maybeMember, {
    onNone: () => ({ text: initials(authorName(author, members, contacts)) }),
    onSome: memberMark
  })
}
