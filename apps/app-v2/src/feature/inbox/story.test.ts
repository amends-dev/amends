import { GroupId } from "@amends-dev/core/group"
import { Notification } from "@amends-dev/core/notification"
import { type Thread, ThreadMessage } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import {
  bob,
  conversationWithBob,
  general,
  membership,
  mention,
  notificationOf,
  now,
  opening,
  reply,
  thread
} from "../../../test/fixtures.ts"
import { MarkAllNotificationsSeen, MarkNotificationSeen } from "./command.ts"
import {
  allNewestFirst,
  byDay,
  Message,
  newestWaiting,
  notificationHeadline,
  notificationPlace,
  notificationReason,
  notificationText,
  OutMessage,
  shownNewestFirst,
  waitingCount,
  waitingNewestFirst
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }

const older = notificationOf("notification-1", 2, 5)
const newer = notificationOf("notification-2", 3, 6)

/** A notification the person already saw. */
const seen = {
  ...notificationOf("notification-3", 4, 7),
  state: Notification.State.cases.Seen.make({ seenAt: newer.recordedAt })
}

/** A notification that comes from no thread. */
const apart = Schema.decodeSync(Notification.Notification)({
  id: "notification-4",
  workspaceId: "workspace-1",
  source: { logId: "thread-log", entryId: "entry-notification-4" },
  recipient: { _tag: "Human", id: "alice", memberId: "member-1" },
  recordedAt: "2026-10-18T12:08:00Z",
  state: { _tag: "Pending" }
})

const itemOf = (notification: Notification.Notification) => ({
  notification,
  thread: Option.some(thread),
  opening: Option.some(opening),
  message: Option.some(reply)
})

/** A notification the store holds neither the thread nor the message of. */
const withoutThread = (notification: Notification.Notification) => ({
  ...itemOf(notification),
  thread: Option.none<Thread.Thread>(),
  opening: Option.none<ThreadMessage.ThreadMessage>(),
  message: Option.none<ThreadMessage.ThreadMessage>()
})

const listed = init(workspace.id, member.id).model

/** The inbox once it knows general and the workspace's members. */
const known = modifyFields(listed, { groups: () => [general], members: () => [member, bob] })

describe("the inbox", () => {
  it("tells why the person is told: the message addresses them, opens the thread, or replies in it", () => {
    const memberId = member.id
    const deleted = {
      ...reply,
      content: ThreadMessage.Content.cases.Deleted.make({ deletedAt: reply.publishedAt })
    }

    expect(notificationReason(itemOf(older), memberId)).toEqual(Option.some("Reply"))
    expect(notificationReason({ ...itemOf(older), message: Option.some(mention) }, memberId)).toEqual(
      Option.some("Mention")
    )
    expect(notificationReason({ ...itemOf(older), message: Option.some(opening) }, memberId)).toEqual(
      Option.some("Thread")
    )
    expect(notificationReason({ ...itemOf(older), message: Option.some(deleted) }, memberId)).toEqual(
      Option.some("Reply")
    )
    expect(notificationReason(withoutThread(older), memberId)).toEqual(Option.none())
  })

  it("puts a mention before the thread's opening, and takes a mention of someone else for a reply", () => {
    const openingWithMention = { ...mention, id: opening.id }

    expect(
      notificationReason(
        { ...itemOf(older), opening: Option.some(openingWithMention), message: Option.some(openingWithMention) },
        member.id
      )
    ).toEqual(Option.some("Mention"))
    expect(
      notificationReason({ ...itemOf(older), message: Option.some(mention) }, bob.id),
      "a mention of someone else is a reply"
    ).toEqual(Option.some("Reply"))
  })

  it("tells who wrote what a notification is about and what they did, or that there was activity", () => {
    expect(notificationHeadline(itemOf(older), known)).toEqual({ mark: "B", author: "Bob", activity: "replied" })
    expect(notificationHeadline({ ...itemOf(older), message: Option.some(mention) }, known)).toEqual({
      mark: "B",
      author: "Bob",
      activity: "mentioned you"
    })
    expect(notificationHeadline({ ...itemOf(older), message: Option.some(opening) }, known)).toEqual({
      mark: "A",
      author: "Alice",
      activity: "started a thread"
    })
    expect(notificationHeadline(withoutThread(older), known)).toEqual({
      mark: "?",
      author: "Activity",
      activity: "in a thread"
    })
  })

  it("tells where a notification comes from: a team, a conversation, or a thread the store lacks", () => {
    const groupId = GroupId.GroupId.make("alice-and-bob")
    const inConversation = {
      ...itemOf({ ...older, thread: { threadId: thread.id, groupId, sequence: 2 } }),
      thread: Option.some({ ...thread, groupId })
    }

    expect(notificationPlace(itemOf(older), known)).toEqual(Option.some("#General"))
    expect(
      notificationPlace(inConversation, modifyFields(known, { groups: () => [general, conversationWithBob] }))
    ).toEqual(Option.some("Bob · Direct message"))
    expect(notificationPlace(withoutThread(older), known)).toEqual(Option.some("Unavailable thread"))
    expect(notificationPlace(itemOf(older), listed), "while the store lacks the group").toEqual(Option.none())
    expect(notificationPlace({ ...itemOf(apart), thread: Option.none() }, known), "from no thread").toEqual(
      Option.none()
    )
  })

  it("tells what a notification says, or why there is nothing to read", () => {
    expect(notificationText(itemOf(older))).toBe("Sounds good")
    expect(notificationText({ ...itemOf(older), message: Option.none() })).toBe("Open the thread to see what happened.")
    expect(notificationText(withoutThread(older))).toBe("You can no longer see this thread.")
  })

  it("lists every notification, or the ones still waiting, newest first, and counts those waiting", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedInbox({ items: [itemOf(older), itemOf(seen), itemOf(newer)] })),
      model((model) => {
        expect(allNewestFirst(model).map(({ notification }) => notification.id)).toEqual([seen.id, newer.id, older.id])
        expect(waitingNewestFirst(model).map(({ notification }) => notification.id)).toEqual([newer.id, older.id])
        expect(shownNewestFirst(model)).toEqual(allNewestFirst(model))
        expect(waitingCount(model)).toBe(2)
        expect(Option.map(newestWaiting(model), ({ id }) => id)).toEqual(Option.some(newer.id))
      }),
      message(Message.ChoseTab({ tab: "Unread" })),
      model((model) => {
        expect(model.tab).toBe("Unread")
        expect(shownNewestFirst(model)).toEqual(waitingNewestFirst(model))
      }),
      message(Message.ReceivedInbox({ items: [itemOf(seen)] })),
      model((model) => {
        expect(waitingCount(model)).toBe(0)
        expect(shownNewestFirst(model)).toEqual([])
        expect(allNewestFirst(model).length).toBe(1)
      }),
      message(Message.ChoseTab({ tab: "All" })),
      model((model) => {
        expect(model.tab).toBe("All")
        expect(shownNewestFirst(model).length).toBe(1)
      }),
      message(Message.FailedRead({ error: "This browser could not read the workspace's copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace's copy."))
      })
    )
  })

  it("starts on All", () => {
    expect(listed.tab).toBe("All")
  })

  it("groups the notifications that came on one day, keeping their order, under what the day is called", () => {
    const yesterday = {
      ...itemOf(older),
      notification: { ...older, recordedAt: DateTime.subtract(older.recordedAt, { days: 1 }) }
    }
    const items = [itemOf(newer), itemOf(older), yesterday]

    expect(
      byDay(items, now).map(({ label, items }) => [label, items.map(({ notification }) => notification.id)])
    ).toEqual([
      ["Today", [newer.id, older.id]],
      ["Yesterday", [older.id]]
    ])
    expect(byDay([], now)).toEqual([])
    expect(byDay([yesterday], now).map(({ label }) => label)).toEqual(["Yesterday"])
  })

  it("reports the thread of the notification opened, and opens nothing for one without a thread", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedInbox({ items: [itemOf(older), itemOf(newer), itemOf(apart)] })),
      message(Message.ClickedOpen({ notificationId: older.id })),
      expectOutMessage(OutMessage.OpenedThread({ groupId: general.id, threadId: thread.id })),
      Command.expectNone(),
      message(Message.ClickedOpen({ notificationId: apart.id })),
      expectNoOutMessage(),
      message(Message.ClickedOpen({ notificationId: seen.id })),
      expectNoOutMessage()
    )
  })

  it("marks one notification seen, and every one through the newest that waits", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedInbox({ items: [itemOf(newer), itemOf(older)] })),
      message(Message.ClickedMarkSeen({ notificationId: older.id })),
      Command.expectExact(MarkNotificationSeen({ ...asMember, notificationId: older.id })),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      message(Message.ClickedMarkAllSeen()),
      Command.expectExact(
        MarkAllNotificationsSeen({ ...asMember, through: { recordedAt: newer.recordedAt, id: newer.id } })
      ),
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAction()),
      message(Message.ReceivedInbox({ items: [itemOf(seen)] })),
      message(Message.ClickedMarkAllSeen()),
      Command.expectNone()
    )
  })

  it("says why a write could not be kept, until one is", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedInbox({ items: [itemOf(older)] })),
      message(Message.ClickedMarkSeen({ notificationId: older.id })),
      Command.resolve(
        MarkNotificationSeen,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      }),
      message(Message.ClickedMarkAllSeen()),
      Command.resolve(
        MarkAllNotificationsSeen,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      message(Message.ClickedMarkSeen({ notificationId: older.id })),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
      })
    )
  })
})
