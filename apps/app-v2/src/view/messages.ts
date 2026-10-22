/** Message and thread text, stacking, and typing labels. */

import { type Thread, ThreadMessage } from "@amends-dev/core/thread"
import type { Member } from "@amends-dev/core/workspace"
import type { MessageText } from "@amends-dev/design/message"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { deletedMessageText } from "../data/messages.ts"

/** How soon after its author's message another stacks under it. */
const stackWithin = 5 * 60_000

/** What decides whether a message stacks: who wrote it, when, and whether it opens a thread that has replies. */
export type Stackable = Readonly<{ author: ThreadMessage.Author; at: DateTime.DateTime; hasReplies: boolean }>

const sameAuthor = Schema.toEquivalence(ThreadMessage.Author)

/**
 * Whether `message` stacks under `previous`, the message just before it with nothing between, as `apps/ui`'s timeline
 * stacks them: by the same author, within five minutes after it, and neither has replies, since a thread's replies end
 * a stack and start their own. The first message has none before it.
 */
export const isStackedUnder = (message: Stackable, previous: Stackable | undefined): boolean => {
  if (previous === undefined || message.hasReplies || previous.hasReplies) {
    return false
  }

  const gap = DateTime.toEpochMillis(message.at) - DateTime.toEpochMillis(previous.at)

  return sameAuthor(message.author, previous.author) && gap >= 0 && gap < stackWithin
}

/**
 * What `message` says as the text a view shows: its markdown, with the members its mentions name, who are called what
 * they are now among `members`, or "Message deleted", which shows quiet and slanted.
 */
export const messageText = (message: ThreadMessage.ThreadMessage, members: ReadonlyArray<Member.Member>): MessageText =>
  ThreadMessage.Content.match(message.content, {
    Text: ({ text }): MessageText => ({ text, mentions: members }),
    Deleted: (): MessageText => ({ deleted: deletedMessageText })
  })

const severalTyping = "Several people are typing…"

/**
 * Who types, as a line says it, as `apps/ui` does: "Ada is typing…" for one, "Ada and Bob are typing…" for two, and
 * "Several people are typing…" for three or more, and nothing while no one types.
 */
export const typingLine = (names: ReadonlyArray<string>): Option.Option<string> => {
  const [first, second] = names

  if (first === undefined) {
    return Option.none()
  }

  if (second === undefined) {
    return Option.some(`${first} is typing…`)
  }

  return Option.some(names.length === 2 ? `${first} and ${second} are typing…` : severalTyping)
}

/**
 * A thread as the person reads it in a list: its title, as written, or its opening message as the text a view shows, or
 * "A thread".
 */
export const threadText = (
  thread: Thread.Thread,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  members: ReadonlyArray<Member.Member>
): MessageText =>
  thread.title === null
    ? Option.match(opening, {
        onNone: (): MessageText => "A thread",
        onSome: (message) => messageText(message, members)
      })
    : thread.title
