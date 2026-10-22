/** The wording, status, summary, and footer of a turn and its activity. */

import type { ReplicaRecord } from "@amends-dev/core/replica"
import type { Turn } from "@amends-dev/core/turn"
import type { TurnState } from "@amends-dev/design/details"
import type { SummaryLine } from "@amends-dev/design/turnLog"
import * as Option from "effect/Option"
import { defineTaggedUnion } from "foldkit/schema"
import { connectionNameIn } from "../../../data/connections.ts"
import { Entry } from "../activity.ts"
import type { TurnProblem } from "../problem.ts"

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

/** Where a turn in each status stands, as `apps/ui` names it: running is working and cancelling is stopping. */
const stateOfStatus: Readonly<Record<Turn.Status, TurnState>> = {
  queued: "queued",
  running: "working",
  cancelling: "stopping",
  completed: "done",
  failed: "failed",
  cancelled: "stopped"
}

/** Where `turn` stands. */
export const stateOf = ({ status }: ReplicaRecord.Turn): TurnState => stateOfStatus[status]

/**
 * What a turn that ended says under its row, `agent` being its agent's name: why it failed; that its agent stopped
 * taking part in the thread or that its task no longer asks it to work; that it ended without a reply. A turn that was
 * stopped because the person asked, or is not over, or replied, says nothing.
 */
export const endingOf = (turn: ReplicaRecord.Turn, agent: string): Option.Option<string> => {
  switch (turn.status) {
    case "failed":
      return Option.fromNullOr(turn.failure)
    case "cancelled":
      switch (turn.cancelReason) {
        case "participation-ended":
          return Option.some(`${agent} stopped taking part in this thread.`)
        case "task-changed":
          return Option.some(`The task no longer asks ${agent} to work on it.`)
        default:
          return Option.none()
      }
    case "completed":
      return turn.messageIds.length === 0 ? Option.some("No reply posted.") : Option.none()
    default:
      return Option.none()
  }
}

/** The problem with a turn's agent, `agent` by name, in words. */
export const problemText = (problem: TurnProblem, agent: string): string => {
  switch (problem) {
    case "stop-failed":
      return "Couldn’t stop the turn. Try again."
    case "retry-failed":
      return "Couldn’t start another attempt. Try again."
    case "finished":
      return "This turn has already finished."
    case "still-running":
      return "This turn is still running."
    case "replied":
      return "This turn already replied."
    case "superseded":
      return "A newer turn followed this one."
    case "departed":
      return `${agent} no longer takes part in this thread.`
    case "denied":
      return `You can’t direct ${agent}.`
    case "gone":
      return "This turn is no longer available."
  }
}
