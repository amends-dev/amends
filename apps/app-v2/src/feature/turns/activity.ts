/** The entries of a turn’s activity, shared by updates and views. */

import type { ReplicaRecord } from "@amends-dev/core/replica"
import { Turn } from "@amends-dev/core/turn"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { defineTaggedUnion } from "foldkit/schema"
import type { TurnItem } from "./definition.ts"

/** Why a turn stopped: the person asked, its agent stopped taking part in the thread, or its task changed. */
const StoppedBy = Schema.Literals(["request", "departure", "task"])

/**
 * One thing in a turn's activity, with when it happened: that the work was accepted and the turn started, which the
 * turn records; what its log holds, the input it took, a response it recorded and whether that was posted as its
 * reply, and a run that stopped short and whether it runs again; and how it ended, which the turn records too.
 */
export const Entry = defineTaggedUnion({
  Accepted: { at: Schema.DateTimeUtc },
  Started: { at: Schema.DateTimeUtc },
  Input: { at: Schema.DateTimeUtc, messages: Schema.Int, isFirst: Schema.Boolean },
  Response: { at: Schema.DateTimeUtc, text: Schema.String, isPosted: Schema.Boolean },
  Interrupted: { at: Schema.DateTimeUtc, reason: Schema.String, isRetrying: Schema.Boolean },
  Replied: { at: Schema.DateTimeUtc },
  Finished: { at: Schema.DateTimeUtc },
  Failed: { at: Schema.DateTimeUtc, reason: Schema.Option(Schema.String) },
  Stopped: { at: Schema.DateTimeUtc, by: StoppedBy }
})
export type Entry = typeof Entry.Type

/** Whether no earlier turn of `turn`'s session was in the thread: its session log began with the turn's own input. */
const beginsItsSession = (turn: ReplicaRecord.Turn, turns: ReadonlyArray<TurnItem>): boolean =>
  !turns.some(
    ({ turn: other }) =>
      other.participationId === turn.participationId && DateTime.isLessThan(other.createdAt, turn.createdAt)
  )

/** Why `turn` was stopped, as the activity says it: someone asked, unless its agent left or its task changed. */
const stoppedBy = (turn: ReplicaRecord.Turn): typeof StoppedBy.Type => {
  switch (turn.cancelReason) {
    case "participation-ended":
      return "departure"
    case "task-changed":
      return "task"
    default:
      return "request"
  }
}

/** How `turn` ended, once it did: that it replied, or finished without one, failed, or stopped. */
const endingEntries = (turn: ReplicaRecord.Turn): ReadonlyArray<Entry> =>
  Option.match(Option.fromNullOr(turn.finishedAt), {
    onNone: () => [],
    onSome: (at) => {
      switch (turn.status) {
        case "completed":
          return [turn.messageIds.length === 0 ? Entry.Finished({ at }) : Entry.Replied({ at })]
        case "failed":
          return [Entry.Failed({ at, reason: Option.fromNullOr(turn.failure) })]
        case "cancelled":
          return [Entry.Stopped({ at, by: stoppedBy(turn) })]
        default:
          return []
      }
    }
  })

/**
 * The activity of the turn `item`, oldest first: that it accepted the work, that it started, what its log `items` hold,
 * and how it ended. Its first input is the one that began its session, which no earlier turn of its agent in the
 * thread's `turns` did, so that it adds the request and the conversation before it.
 */
export const entriesOf = (
  { turn }: TurnItem,
  items: ReadonlyArray<Turn.LogItem>,
  turns: ReadonlyArray<TurnItem>
): ReadonlyArray<Entry> => {
  const firstInputIndex = items.findIndex(Turn.LogItem.isAnyOf(["InputTaken"]))
  const isSessionFirst = beginsItsSession(turn, turns)

  return [
    Entry.Accepted({ at: turn.createdAt }),
    ...Option.toArray(Option.map(Option.fromNullOr(turn.startedAt), (at) => Entry.Started({ at }))),
    ...items.map((item, index) =>
      Turn.LogItem.match<Entry>(item, {
        InputTaken: ({ at, messages }) =>
          Entry.Input({ at, messages, isFirst: isSessionFirst && index === firstInputIndex }),
        Responded: ({ at, text, reply }) => Entry.Response({ at, text, isPosted: reply }),
        Interrupted: ({ at, reason, retryable }) => Entry.Interrupted({ at, reason, isRetrying: retryable })
      })
    ),
    ...endingEntries(turn)
  ]
}
