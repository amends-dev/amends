/** Notification headlines, message previews, places, and day groups. */

import type { MemberId } from "@amends-dev/core/workspace"
import type { MarkContent } from "@amends-dev/design/mark"
import type { MessageText } from "@amends-dev/design/message"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import { placeName } from "../../../data/groups.ts"
import { authorMemberId, authorName } from "../../../data/messages.ts"
import { authorMark } from "../../../view/members.ts"
import { messageText } from "../../../view/messages.ts"
import { type Day, groupByDay } from "../../../view/time.ts"
import {
  findGroup,
  itemOfNotification,
  notificationReason,
  type InboxItem,
  type Model,
  type Reason
} from "../definition.ts"

/**
 * `items`, newest first, as the days they came on by the person's own clock, each named as it is from `now`:
 * "Today", "Yesterday", a weekday, or a date.
 */
export const byDay = (items: ReadonlyArray<InboxItem>, now: DateTime.Utc): ReadonlyArray<Day<InboxItem>> =>
  groupByDay(items, ({ notification }) => notification.recordedAt, now)

/** What a notification's author did, as the first line says it after their name. */
const doneForReason: Readonly<Record<Reason, string>> = {
  Mention: "mentioned you",
  Thread: "started a thread",
  Reply: "replied"
}

/** A reason in the words of the side pane's subtitle, as `apps/ui` says them. */
const reasonWords: Readonly<Record<Reason, string>> = { Mention: "Mention", Thread: "New thread", Reply: "Reply" }

/**
 * Why the person came to the thread open beside the inbox, in the words of the side pane's subtitle, while the store
 * holds the message its notification's activity is about.
 */
export const selectedReasonWords = (model: Model): Option.Option<string> =>
  Option.flatMap(model.selected, ({ notificationId }) =>
    Option.flatMap(itemOfNotification(model, notificationId), (item) =>
      Option.map(notificationReason(item, model.memberId), (reason) => reasonWords[reason])
    )
  )

/**
 * Who wrote the message a notification's activity is about, with their mark, and who they are when they are a member,
 * while the store holds it.
 */
const notificationAuthor = (
  item: InboxItem,
  model: Model
): Option.Option<Readonly<{ name: string; mark: MarkContent; memberId: MemberId.MemberId | undefined }>> =>
  Option.map(item.message, ({ author }) => ({
    name: authorName(author, model.members, model.contacts),
    mark: authorMark(author, model.members, model.contacts),
    memberId: authorMemberId(author)
  }))

/**
 * A notification's first line: the mark and name of who wrote the message its activity is about, and who they are when
 * they are a member, whose card they open, and what they did, with the mark on the author's tone, or, while the store
 * lacks the message, that there was activity, with the message icon for a mark.
 */
export const notificationHeadline = (
  item: InboxItem,
  model: Model
): Readonly<{ mark: MarkContent; author: string; authorId: MemberId.MemberId | undefined; activity: string }> =>
  Option.match(Option.all([notificationAuthor(item, model), notificationReason(item, model.memberId)]), {
    onNone: () => ({ mark: { icon: "message" }, author: "Activity", authorId: undefined, activity: "in a thread" }),
    onSome: ([{ name, mark, memberId }, reason]) => ({
      mark,
      author: name,
      authorId: memberId,
      activity: doneForReason[reason]
    })
  })

/**
 * Where a notification comes from: a team by its name, a conversation by the others in it, or that the thread is
 * unavailable while the store lacks it. Nothing for a notification from no thread, or while the store lacks the
 * thread's group.
 */
export const notificationPlace = (item: InboxItem, model: Model): Option.Option<string> =>
  item.notification.thread === undefined
    ? Option.none()
    : Option.match(item.thread, {
        onNone: () => Option.some("Unavailable thread"),
        onSome: ({ groupId }) =>
          Option.map(findGroup(model, groupId), (group) => {
            const place = placeName(group, model.members, model.memberId)
            return group.kind === "Team" ? place : `${place} · Direct message`
          })
      })

/**
 * What the message a notification's activity is about says, as markdown whose mentions name their members as they are
 * called now, or why there is nothing to read.
 */
export const notificationText = (item: InboxItem, model: Model): MessageText =>
  Option.match(item.message, {
    onNone: () =>
      Option.isSome(item.thread) ? "Open the thread to see what happened." : "You can no longer see this thread.",
    onSome: (message) => messageText(message, model.members)
  })
