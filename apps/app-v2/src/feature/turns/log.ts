/**
 * What a turn's log pane says, decided from the turn, what its log holds, and the thread's other turns: the activity as
 * a list of entries, oldest first, each in the words `apps/ui` gives it; the lines of what the turn ran on; and the
 * line at the foot that fits how it stands.
 */

import type { ReplicaRecord } from "@amends-dev/core/replica"
import { Turn } from "@amends-dev/core/turn"
import type { TurnState } from "@amends-dev/design/details"
import type { SummaryLine } from "@amends-dev/design/turnLog"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { defineTaggedUnion } from "foldkit/schema"
import { connectionNameIn } from "../../seen.ts"
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

/** What an entry says: its title in medium weight and the line under it, when it has one. */
export type Words = Readonly<{ title: string; text: string | undefined }>

/** `entry` in `apps/ui`'s words, `agent` being the name of its agent. */
export const wordsOf = (entry: Entry, agent: string): Words =>
  Entry.match(entry, {
    Accepted: () => ({ title: "Work accepted", text: `${agent} picked up the request from this thread.` }),
    Started: () => ({ title: "Turn started", text: "Running on the recorded harness, model, and sandbox." }),
    Input: ({ isFirst, messages }) => ({
      title: "Thread input received",
      text: isFirst
        ? "The request and prior conversation were added."
        : messages === 1
          ? "Another message from the thread was added."
          : `${messages} more messages from the thread were added.`
    }),
    Response: ({ isPosted }) => ({ title: isPosted ? "Reply recorded" : "Response recorded", text: undefined }),
    Interrupted: ({ reason, isRetrying }) => ({
      title: "Interrupted",
      text: isRetrying ? `${reason} Trying again.` : reason
    }),
    Replied: () => ({ title: "Reply posted", text: "Turn completed. Open the reply in its thread." }),
    Finished: () => ({ title: "Turn completed", text: "No reply was posted." }),
    Failed: ({ reason }) => ({ title: "Turn failed", text: Option.getOrUndefined(reason) }),
    Stopped: ({ by }) => ({
      title: "Turn stopped",
      text: {
        departure: `${agent} stopped taking part in this thread.`,
        task: `The task no longer asks ${agent} to work on it. Its output stays in this log.`,
        request: "It stopped as asked. Its output stays in this log."
      }[by]
    })
  })

/** What a turn says in place of what it ran on while it has no record of it, by how it stands. */
const unstartedWords = (state: TurnState): string => {
  switch (state) {
    case "failed":
      return "This turn failed before execution started."
    case "stopped":
      return "This turn stopped before execution started."
    default:
      return "The harness, model, and sandbox are recorded when work starts."
  }
}

/**
 * What the turn ran on, a line each: where it works, `where`, such as "Thread in #general"; and, once it started, the
 * model by its connection's name and its id, the harness, and the sandbox, each by its connection's name among
 * `connections`, or that it has none; before that, why there is nothing to say of them.
 */
export const summaryOf = (
  turn: ReplicaRecord.Turn,
  state: TurnState,
  where: string,
  connections: ReadonlyArray<ReplicaRecord.Connection>
): ReadonlyArray<SummaryLine> => {
  const { selection } = turn

  return [
    { text: where },
    ...(selection === null
      ? [{ text: unstartedWords(state) }]
      : [
          {
            text: `${connectionNameIn(connections, selection.model.connectionId)} · ${selection.model.id}`,
            isCode: true
          },
          { text: `Harness · ${connectionNameIn(connections, selection.harness.connectionId)}` },
          {
            text:
              selection.sandbox === null
                ? "No sandbox"
                : `Sandbox · ${connectionNameIn(connections, selection.sandbox.connectionId)}`
          }
        ])
  ]
}

/**
 * The line at the foot of a turn's log: that it is followed live; that something new is below the view; the retry that
 * starts another attempt; the reply to open in its thread; that it waits to start; or that it finished.
 */
export const Footer = defineTaggedUnion({
  FollowingLive: {},
  NewActivity: {},
  RetryTurn: {},
  ViewReply: {},
  Waiting: {},
  Finished: {}
})
export type Footer = typeof Footer.Type

/** What decides the footer besides where the turn stands. */
export type FooterFacts = Readonly<{
  /** The log grew while the person was not at its end. */
  hasNewActivity: boolean
  /** The person may direct the agent and nothing else keeps the turn from running again. */
  canRetry: boolean
  /** The turn posted a reply. */
  hasReply: boolean
}>

/** The footer that fits a turn in `state`, in the order `apps/ui` tries them. */
export const footerOf = (state: TurnState, { hasNewActivity, canRetry, hasReply }: FooterFacts): Footer => {
  if (hasNewActivity) {
    return Footer.NewActivity()
  }

  if (canRetry) {
    return Footer.RetryTurn()
  }

  if (state === "done" && hasReply) {
    return Footer.ViewReply()
  }

  if (state === "queued") {
    return Footer.Waiting()
  }

  return state === "working" || state === "stopping" ? Footer.FollowingLive() : Footer.Finished()
}
