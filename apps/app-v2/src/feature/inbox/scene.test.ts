import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, Subscription, click, expect, expectOutMessage, given, role, scene, text } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, general, membership, notificationOf, opening, reply, thread } from "../../../test/fixtures.ts"
import { InboxBlock } from "./block.ts"
import { MarkAllNotificationsSeen, MarkNotificationSeen } from "./command.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }

const notification = notificationOf("notification-1", 2, 5)

/** Bob's reply in a thread of general, which the notification tells of. */
const bobsReply = {
  notification,
  thread: Option.some(thread),
  opening: Option.some(opening),
  message: Option.some(reply)
}

/** The inbox read, with the notification, general, and the workspace's members. */
const opened = modifyFields(init(workspace.id, member.id).model, {
  items: () => [bobsReply],
  groups: () => [general],
  members: () => [member, bob]
})

describe("the inbox", () => {
  it("shows each notification by the message it is about and the thread it comes from, and marks them all seen", () => {
    scene(
      { update, view, subscriptions: InboxBlock.subscriptions },
      given(opened),
      expect(text("Bob: Sounds good · Plans for the week in General")).toExist(),
      click(role("button", { name: "Mark all seen" })),
      Command.expectExact(
        MarkAllNotificationsSeen({ ...asMember, through: { recordedAt: notification.recordedAt, id: notification.id } })
      ),
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAction()),
      // Once nothing waits, the inbox says so.
      Subscription.emit(subscriptions.inbox, Message.ReceivedInbox({ items: [] })),
      expect(text("Nothing new.")).toExist(),
      expect(role("button", { name: "Mark all seen" })).toBeAbsent()
    )
  })

  it("marks one notification seen, and opens its thread", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "Mark seen" })),
      Command.expectExact(MarkNotificationSeen({ ...asMember, notificationId: notification.id })),
      Command.resolve(
        MarkNotificationSeen,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      expect(text("This browser could not keep that. Try again.")).toExist(),
      click(role("button", { name: "Open" })),
      expectOutMessage(OutMessage.OpenedThread({ groupId: general.id, threadId: thread.id }))
    )
  })

  it("says only that there was activity while the store holds neither the thread nor the message", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { items: () => [{ ...bobsReply, thread: Option.none(), message: Option.none() }] })),
      expect(text("New activity")).toExist()
    )
  })
})
