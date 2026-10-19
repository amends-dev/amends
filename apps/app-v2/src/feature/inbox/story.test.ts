import { Notification } from "@amends-dev/core/notification"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import { bob, general, membership, notificationOf, opening, reply, thread } from "../../../test/fixtures.ts"
import { MarkAllNotificationsSeen, MarkNotificationSeen } from "./command.ts"
import {
  Message,
  OutMessage,
  notificationAuthor,
  notificationContext,
  notificationText,
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

const listed = init(workspace.id, member.id).model

/** The inbox once it knows general and the workspace's members. */
const known = modifyFields(listed, { groups: () => [general], members: () => [member, bob] })

describe("the inbox", () => {
  it("tells who wrote what a notification is about, where it comes from, and what it says", () => {
    const item = itemOf(older)
    const activity = { ...item, thread: Option.none(), opening: Option.none(), message: Option.none() }

    expect(notificationAuthor(item, known)).toEqual({ name: "Bob", mark: "B" })
    expect(notificationText(item)).toBe("Sounds good")
    expect(notificationContext(item, known)).toEqual(Option.some("Plans for the week in General"))
    expect(notificationContext(item, listed)).toEqual(Option.some("Plans for the week"))
    expect(notificationAuthor(activity, known)).toEqual({ name: "Activity", mark: "?" })
    expect(notificationText(activity)).toBe("New activity")
    expect(notificationContext(activity, known)).toEqual(Option.none())
  })

  it("lists the notifications still waiting, newest first, and counts them", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedInbox({ items: [itemOf(older), itemOf(seen), itemOf(newer)] })),
      model((model) => {
        expect(waitingNewestFirst(model).map(({ notification }) => notification.id)).toEqual([newer.id, older.id])
        expect(waitingCount(model)).toBe(2)
      }),
      message(Message.ReceivedInbox({ items: [itemOf(seen)] })),
      model((model) => {
        expect(waitingCount(model)).toBe(0)
      }),
      message(Message.FailedRead({ error: "This browser could not read the workspace's copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace's copy."))
      })
    )
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
