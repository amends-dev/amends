/**
 * What a thread's timeline holds after its opening, by when each thing happened: its replies, the turns where agents
 * took on the work that did not reply, and the notes of who followed the thread or stopped taking part in it.
 */

import type { ReplicaRecord } from "@amends-dev/core/replica"
import type { ThreadMessageId } from "@amends-dev/core/thread"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import { defineTaggedUnion } from "foldkit/schema"
import { TurnItem } from "../turns/definition.ts"
import { MessageItem, type Model, ParticipationChange } from "./definition.ts"

/**
 * A thing in the timeline: a message that was posted, a turn where an agent took on the work, or a change to who takes
 * part in the thread.
 */
export const Entry = defineTaggedUnion({
  Posted: { item: MessageItem },
  Took: { item: TurnItem },
  Noted: { change: ParticipationChange }
})
export type Entry = typeof Entry.Type

/**
 * When the entry happened: a message when it was published, a turn when the agent took on the work, a note when the
 * change was made.
 */
export const whenOf = Entry.match({
  Posted: ({ item }): DateTime.Utc => item.message.publishedAt,
  Took: ({ item }): DateTime.Utc => item.turn.createdAt,
  Noted: ({ change }): DateTime.Utc => change.at
})

/**
 * What orders entries that happened at one moment: a turn follows the message that asked for it, and a note comes
 * last.
 */
const kindRank = Entry.match({ Posted: () => 0, Took: () => 1, Noted: () => 2 })

const byWhenThenKind: Order.Order<Entry> = Order.combine(
  Order.mapInput(DateTime.Order, whenOf),
  Order.mapInput(Order.Number, kindRank)
)

/** Whether one of the replies `turn` posted is among the thread's `messages`. */
const hasReplyAmong = ({ turn }: TurnItem, messages: ReadonlyArray<MessageItem>): boolean =>
  turn.messageIds.some((id) => messages.some(({ message }) => message.id === id))

/**
 * The thread's opening message, once it is read, and, after it, in the order they happened, its replies, its turns
 * that did not post a reply among them, and the notes of who followed it or stopped taking part: a turn that replied is
 * shown as its reply.
 */
export const timelineOf = (
  model: Model
): Readonly<{ opening: Option.Option<MessageItem>; after: ReadonlyArray<Entry> }> => {
  const [opening, ...replies] = model.messages
  const after = [
    ...replies.map((item) => Entry.Posted({ item })),
    ...model.turns.turns.filter((item) => !hasReplyAmong(item, model.messages)).map((item) => Entry.Took({ item })),
    ...model.changes.map((change) => Entry.Noted({ change }))
  ]

  return { opening: Option.fromUndefinedOr(opening), after: after.toSorted(byWhenThenKind) }
}

/** The turn that posted the message `messageId` as its reply. */
export const turnPostingReply = (
  model: Model,
  messageId: ThreadMessageId.ThreadMessageId
): Option.Option<ReplicaRecord.Turn> =>
  Option.map(
    Option.fromUndefinedOr(model.turns.turns.find(({ turn }) => turn.messageIds.includes(messageId))),
    ({ turn }) => turn
  )
