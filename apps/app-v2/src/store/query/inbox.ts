/** Inbox entries joined with the threads and messages they refer to. */

import type { Thread, ThreadMessage } from "@amends-dev/core/thread"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import { byPublished } from "../../data/messages.ts"
import * as Pending from "../Pending.ts"
import type * as Replica from "../Replica.ts"

/**
 * A notification as the person's inbox shows it: the thread it comes from, with its opening
 * message, and the message its activity is about, when the replica holds them.
 */
export interface InboxEntry {
  readonly notification: Pending.Held<Replica.RecordOf<"Notification">>
  readonly thread: Option.Option<Thread.Thread>
  readonly opening: Option.Option<ThreadMessage.ThreadMessage>
  readonly message: Option.Option<ThreadMessage.ThreadMessage>
}

/** The message an activity is about, when it names one. */
const messageIdOf = (activity: Replica.RecordOf<"ThreadActivity"> | undefined): unknown =>
  activity !== undefined && Predicate.hasProperty(activity.value.details, "messageId")
    ? activity.value.details.messageId
    : undefined

/** Notifications after pending actions, with the thread and messages each notification refers to. */
export const deriveInbox = (
  { notifications, threads }: Replica.InboxRecords,
  pending: ReadonlyArray<Pending.Unfinished>
): ReadonlyArray<InboxEntry> =>
  Pending.overlay("Notification", undefined, notifications, pending).map((notification): InboxEntry => {
    const source = notification.record.value.thread
    const held = source === undefined ? undefined : threads.find(({ thread }) => thread.value.id === source.threadId)
    const messageId = messageIdOf(held?.activities.find(({ value }) => value.sequence === source?.sequence))
    return {
      notification,
      thread: Option.fromUndefinedOr(held?.thread.value),
      opening: Array.head(
        Array.sort(
          (held?.messages ?? []).map(({ value }) => value),
          byPublished
        )
      ),
      message: Option.fromUndefinedOr(held?.messages.find(({ value }) => value.id === messageId)?.value)
    }
  })
