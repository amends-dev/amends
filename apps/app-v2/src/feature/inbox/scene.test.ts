import { GroupId } from "@amends-dev/core/group"
import { Notification } from "@amends-dev/core/notification"
import { describe, it } from "@effect/vitest"
import { DateTime, Option, Struct } from "effect"
import {
  Command,
  Subscription,
  all,
  click,
  expect,
  expectAll,
  expectOutMessage,
  given,
  nth,
  role,
  scene,
  text,
  withViewInputs,
  within
} from "foldkit/scene"
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
import { InboxBlock } from "./block.ts"
import { MarkAllNotificationsSeen, MarkNotificationSeen } from "./command.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }

const sceneView = withViewInputs(view, { now })()

const notification = notificationOf("notification-1", 2, 5)

/** Bob's reply in a thread of general, which the notification tells of. */
const bobsReply = {
  notification,
  thread: Option.some(thread),
  opening: Option.some(opening),
  message: Option.some(reply)
}

/** What the person saw of a notification, as the store gives it. */
const seen = (item: typeof bobsReply) => ({
  ...item,
  notification: { ...item.notification, state: Notification.State.cases.Seen.make({ seenAt: now }) }
})

/** The inbox read, with the notification, general, and the workspace's members. */
const opened = modifyFields(init(workspace.id, member.id).model, {
  items: () => [bobsReply],
  groups: () => [general],
  members: () => [member, bob]
})

const notifications = role("list", { name: "Notifications" })

/** The `index`th item of the list, a day's divider or a notification. */
const item = (index: number) => nth(all.role("listitem"), index)

describe("the inbox", () => {
  it("shows each notification under its day, by its author and what they did, where it comes from, and how long ago", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-selected", "true"),
      expect(within(notifications, text("Today"))).toExist(),
      expect(within(notifications, text("Bob"))).toExist(),
      expect(within(notifications, text(" replied"))).toExist(),
      expect(within(notifications, text("#General"))).toExist(),
      expect(within(notifications, text("25m ago"))).toExist(),
      expect(within(notifications, role("button", { name: "Bob replied" }))).toExist(),
      expect(role("button", { name: "Bob replied" })).toHaveAttr("aria-description", "Sounds good"),
      expect(text("Notifications about your threads arrive here.")).toBeAbsent()
    )
  })

  it("marks them all seen, then keeps them on All without a dot, and shows none on Unread", () => {
    scene(
      { update, view: sceneView, subscriptions: InboxBlock.subscriptions },
      given(opened),
      expect(role("tab", { name: "Unread" })).toHaveAttr("aria-description", "1"),
      expect(within(notifications, text("Unread"))).toExist(),
      click(role("button", { name: "Mark all seen" })),
      Command.expectExact(
        MarkAllNotificationsSeen({ ...asMember, through: { recordedAt: notification.recordedAt, id: notification.id } })
      ),
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAction()),
      // Once the store reports it seen, it is on All with nothing to do about it.
      Subscription.emit(subscriptions.inbox, Message.ReceivedInbox({ items: [seen(bobsReply)] })),
      expect(within(notifications, role("button", { name: "Bob replied" }))).toExist(),
      expect(within(notifications, text("Unread"))).toBeAbsent(),
      expect(role("button", { name: "Mark seen" })).toBeAbsent(),
      expect(role("button", { name: "Mark all seen" })).toBeAbsent(),
      expect(role("tab", { name: "Unread" })).toHaveAttr("aria-description", "0"),
      click(role("tab", { name: "Unread" })),
      expect(role("tab", { name: "Unread" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-selected", "false"),
      expect(role("heading", { name: "You're all caught up", level: 2 })).toExist(),
      expect(text("Nothing new.")).toExist(),
      expect(notifications).toBeAbsent()
    )
  })

  it("shows what waits and what was seen on All, and only what waits on Unread", () => {
    const seenMention = {
      ...seen(bobsReply),
      notification: { ...seen(bobsReply).notification, id: Notification.NotificationId.make("notification-2") },
      message: Option.some(mention)
    }

    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [bobsReply, seenMention] })),
      expect(role("button", { name: "Bob replied" })).toExist(),
      expect(role("button", { name: "Bob mentioned you" })).toExist(),
      expectAll(all.role("button", { name: "Mark seen" })).toHaveCount(1),
      expectAll(all.text("Unread")).toHaveCount(2),
      click(role("tab", { name: "Unread" })),
      expect(role("button", { name: "Bob replied" })).toExist(),
      expect(role("button", { name: "Bob mentioned you" })).toBeAbsent(),
      click(role("tab", { name: "All" })),
      expect(role("button", { name: "Bob mentioned you" })).toExist()
    )
  })

  it("sets the days apart, newest first, and says how long ago by the day once it is not today", () => {
    const yesterday = {
      ...bobsReply,
      notification: {
        ...notificationOf("notification-2", 3, 5),
        recordedAt: DateTime.subtract(notification.recordedAt, { days: 1 })
      }
    }

    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [yesterday, bobsReply] })),
      expectAll(all.role("listitem")).toHaveCount(4),
      expect(within(item(0), text("Today"))).toExist(),
      expect(within(item(1), text("25m ago"))).toExist(),
      expect(within(item(2), text("Yesterday"))).toExist(),
      expect(within(item(3), text("Yesterday"))).toExist(),
      expect(within(item(3), role("button", { name: "Bob replied" }))).toExist()
    )
  })

  it("says what a message did to the person: it mentioned them, it started a thread, or it replied", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [{ ...bobsReply, message: Option.some(mention) }] })),
      expect(role("button", { name: "Bob mentioned you" })).toExist(),
      expect(role("button", { name: "Bob mentioned you" })).toHaveAttr("aria-description", "Can you take a look?")
    )
    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [{ ...bobsReply, message: Option.some(opening) }] })),
      expect(role("button", { name: "Alice started a thread" })).toExist()
    )
  })

  it("names a conversation by the others in it", () => {
    const groupId = GroupId.GroupId.make("alice-and-bob")
    const inConversation = {
      ...bobsReply,
      notification: { ...notification, thread: { threadId: thread.id, groupId, sequence: 2 } },
      thread: Option.some({ ...thread, groupId })
    }

    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [inConversation], groups: () => [conversationWithBob] })),
      expect(text("Bob · Direct message")).toExist(),
      expect(text("#General")).toBeAbsent()
    )
  })

  it("marks one notification seen, and opens its thread", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      click(role("button", { name: "Mark seen" })),
      Command.expectExact(MarkNotificationSeen({ ...asMember, notificationId: notification.id })),
      Command.resolve(
        MarkNotificationSeen,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      expect(text("This browser could not keep that. Try again.")).toExist(),
      expect(role("button", { name: "Open" })).toBeAbsent(),
      click(role("button", { name: "Bob replied" })),
      expectOutMessage(OutMessage.OpenedThread({ groupId: general.id, threadId: thread.id }))
    )
  })

  it("says only that there was activity in a thread the store lacks, which can still be opened", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [{ ...bobsReply, thread: Option.none(), message: Option.none() }] })),
      expect(text("Activity")).toExist(),
      expect(text("Unavailable thread")).toExist(),
      expect(text("You can no longer see this thread.")).toExist(),
      expect(role("button", { name: "Activity in a thread" })).toExist(),
      click(role("button", { name: "Activity in a thread" })),
      expectOutMessage(OutMessage.OpenedThread({ groupId: general.id, threadId: thread.id }))
    )
  })

  it("shows the text of a notification that comes from no thread as plain text, with nothing to open", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(opened, {
          items: () => [{ ...bobsReply, notification: Struct.omit(notification, ["thread"]), thread: Option.none() }]
        })
      ),
      expect(text("Sounds good")).toExist(),
      expect(role("button", { name: "Bob replied" })).toBeAbsent(),
      expect(text("Unavailable thread")).toBeAbsent(),
      expect(role("button", { name: "Mark seen" })).toExist()
    )
  })

  it("names no place while the store does not hold the thread's group", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { groups: () => [] })),
      expect(role("button", { name: "Bob replied" })).toExist(),
      expect(text("#General")).toBeAbsent(),
      expect(text("Unavailable thread")).toBeAbsent()
    )
  })

  it("says there is nothing yet on All, and that all is caught up on Unread, while nothing waits", () => {
    scene(
      { update, view: sceneView },
      given(init(workspace.id, member.id).model),
      expect(role("heading", { name: "Nothing here yet", level: 2 })).toExist(),
      expect(text("Notifications about your threads arrive here.")).toExist(),
      expect(role("button", { name: "Mark all seen" })).toBeAbsent(),
      click(role("tab", { name: "Unread" })),
      expect(role("heading", { name: "You're all caught up", level: 2 })).toExist(),
      expect(text("Nothing new.")).toExist(),
      expect(role("heading", { name: "Nothing here yet" })).toBeAbsent()
    )
  })
})
