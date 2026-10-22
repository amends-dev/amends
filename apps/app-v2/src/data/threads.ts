/** Thread titles, reply summaries, activity times, and participation history. */

import {
  type Thread,
  ThreadMessage,
  type ThreadActivity,
  ThreadActivityKind,
  ThreadParticipation,
  ThreadParticipationActivity
} from "@amends-dev/core/thread"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { messageWords } from "./messages.ts"
import { foldAccents } from "./search.ts"

/** A thread's title, its opening's words, or the fallback when neither is known. */
export const threadWords = (
  thread: Thread.Thread,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  members: ReadonlyArray<Member.Member>
): string =>
  thread.title ??
  Option.match(opening, {
    onNone: () => "A thread",
    onSome: (message) => messageWords(message, members)
  })

/** Match either the title or the opening's words, ignoring case, accents, and surrounding whitespace. */
export const threadContains = (
  thread: Thread.Thread,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  members: ReadonlyArray<Member.Member>,
  query: string
): boolean => {
  const wanted = foldAccents(query.trim())
  const words = [thread.title, ...Option.toArray(Option.map(opening, (message) => messageWords(message, members)))]

  return wanted === "" || words.some((text) => text !== null && foldAccents(text).includes(wanted))
}

const sameAuthor = Schema.toEquivalence(ThreadMessage.Author)

/** The replies among a thread's `messages`, oldest first: how many follow the opening, and who wrote them. */
export const summarizeReplies = (
  messages: ReadonlyArray<ThreadMessage.ThreadMessage>
): Readonly<{ replies: number; repliers: ReadonlyArray<ThreadMessage.Author> }> => {
  const replies = Array.drop(messages, 1)
  return {
    replies: replies.length,
    repliers: Array.dedupeWith(
      replies.map(({ author }) => author),
      sameAuthor
    )
  }
}

/**
 * When the latest of a thread's `messages`, oldest first, was published, or when the thread was created while it
 * has none.
 */
export const deriveLastActiveAt = (
  thread: Thread.Thread,
  messages: ReadonlyArray<ThreadMessage.ThreadMessage>
): DateTime.Utc =>
  Option.match(Array.last(messages), { onNone: () => thread.createdAt, onSome: (latest) => latest.publishedAt })

/**
 * What a member did to their part in a thread that its timeline notes: they followed it, stopped following it, left
 * its group, were removed from its group, or were removed from the workspace.
 */
export type ParticipationChangeKind =
  | "followed"
  | "unfollowed"
  | "left-group"
  | "removed-from-group"
  | "removed-from-workspace"

/** A change to a member's part in a thread, when it was made, and whose part it was. */
export interface ParticipationChange {
  readonly id: ThreadActivity.ThreadActivityId
  readonly at: DateTime.Utc
  readonly change: ParticipationChangeKind
  readonly memberId: MemberId.MemberId
}

/** How each way a participation ended is noted. */
const endingChange: Readonly<Record<ThreadParticipation.EndReason, ParticipationChangeKind>> = {
  unfollowed: "unfollowed",
  "group-left": "left-group",
  "group-removed": "removed-from-group",
  "workspace-removed": "removed-from-workspace"
}

/** Which participation an activity is about and what it did to it, when it followed or ended one. */
const changeOf = (
  activity: ThreadActivity.ThreadActivity
): Option.Option<
  Readonly<{ participationId: ThreadParticipation.ThreadParticipation["id"]; change: ParticipationChangeKind }>
> => {
  if (ThreadActivityKind.is(ThreadParticipationActivity.Followed)(activity)) {
    return Option.map(
      Schema.decodeUnknownOption(ThreadParticipationActivity.Followed.details)(activity.details),
      ({ participationId }) => ({ participationId, change: "followed" as const })
    )
  }

  if (ThreadActivityKind.is(ThreadParticipationActivity.Ended)(activity)) {
    return Option.map(
      Schema.decodeUnknownOption(ThreadParticipationActivity.Ended.details)(activity.details),
      ({ participationId, reason }) => ({ participationId, change: endingChange[reason] })
    )
  }

  return Option.none()
}

/**
 * The follows and endings among a thread's `activities` that its timeline notes, in the order of the thread, each with
 * the member whose part it was among `participations`. Joining by writing or by being mentioned records no activity of
 * its own, so it has no note, and a participation that is not a member's, a contact's or the triage's, has none either.
 */
export const deriveParticipationChanges = (
  activities: ReadonlyArray<ThreadActivity.ThreadActivity>,
  participations: ReadonlyArray<ThreadParticipation.ThreadParticipation>
): ReadonlyArray<ParticipationChange> =>
  Array.sort(
    activities,
    Order.mapInput(Order.Number, ({ sequence }: ThreadActivity.ThreadActivity) => sequence)
  ).flatMap((activity): ReadonlyArray<ParticipationChange> =>
    Option.match(changeOf(activity), {
      onNone: () => [],
      onSome: ({ participationId, change }) => {
        const participation = participations.find(({ id }) => id === participationId)
        const memberId =
          participation === undefined ? undefined : ThreadParticipation.memberOf(participation.participant)

        return memberId === undefined ? [] : [{ id: activity.id, at: activity.occurredAt, change, memberId }]
      }
    })
  )
