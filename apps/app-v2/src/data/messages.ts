/** Message authors, plain text, and typing participants. */

import type { Contact } from "@amends-dev/core/channel"
import type { Presence } from "@amends-dev/core/presence"
import { ThreadMessage, type ThreadId } from "@amends-dev/core/thread"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import { markdownWords } from "@amends-dev/markdown"
import { isAgent } from "./members.ts"

export const deletedMessageText = "Message deleted"

export const messageWords = (message: ThreadMessage.ThreadMessage, members: ReadonlyArray<Member.Member>): string =>
  ThreadMessage.Content.match(message.content, {
    Text: ({ text }) => markdownWords({ text, mentions: members }),
    Deleted: () => deletedMessageText
  })

/** `author` by their name here: a member's, or the name a channel's contact gave. */
export const authorName = (
  author: ThreadMessage.Author,
  members: ReadonlyArray<Member.Member>,
  contacts: ReadonlyArray<Contact.Contact>
): string =>
  ThreadMessage.Author.match(author, {
    Member: ({ memberId }) => members.find((member) => member.id === memberId)?.name ?? "Someone",
    Contact: ({ contactId }) => contacts.find(({ id }) => id === contactId)?.name ?? "A contact"
  })

/** Whether `author` is a member that is an agent, which a message marks in the agent's tone and color. */
export const isAuthorAgent = (author: ThreadMessage.Author, members: ReadonlyArray<Member.Member>): boolean =>
  ThreadMessage.Author.match(author, {
    Member: ({ memberId }) => members.some((member) => member.id === memberId && isAgent(member)),
    Contact: () => false
  })

/** The member `author` is, whose card their name and mark open: none for a channel's contact, who has no card. */
export const authorMemberId = (author: ThreadMessage.Author): MemberId.MemberId | undefined =>
  ThreadMessage.Author.match(author, { Member: ({ memberId }) => memberId, Contact: () => undefined })

/**
 * Who among `present` other than `self` types in the thread `threadId`, by their names among `members`, or "Someone"
 * for a member whose name is not read.
 */
export const typingNames = (
  present: ReadonlyArray<Presence.Present>,
  threadId: ThreadId.ThreadId,
  self: MemberId.MemberId,
  members: ReadonlyArray<Member.Member>
): ReadonlyArray<string> =>
  present
    .filter((who) => who.typingIn === threadId && who.memberId !== self)
    .map(({ memberId }) => members.find((member) => member.id === memberId)?.name ?? "Someone")
