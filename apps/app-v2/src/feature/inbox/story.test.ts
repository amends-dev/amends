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
  saying,
  thread
} from "../../../test/fixtures.ts"
import { ComposerBlock } from "../composer/block.ts"
import { ReadDraft } from "../composer/command.ts"
import { MarkAllNotificationsSeen, MarkNotificationSeen } from "./command.ts"
import {
  byDay,
  findGroup,
  type InboxItem,
  Message,
  newestWaiting,
  notificationHeadline,
  notificationPlace,
  notificationReason,
  notificationText,
  OutMessage,
  shownItems,
  waitingCount
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

/** The ids of the notifications of `items`, in their order. */
const idsOf = (items: ReadonlyArray<InboxItem>) => items.map(({ notification }) => notification.id)

/** `item` once the store reports it seen. */
const markedSeen = (item: InboxItem): InboxItem => ({
  ...item,
  notification: { ...item.notification, state: Notification.State.cases.Seen.make({ seenAt: newer.recordedAt }) }
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
    expect(notificationText(itemOf(older), known)).toEqual([{ text: "Sounds good" }])
    expect(notificationText({ ...itemOf(older), message: Option.none() }, known)).toEqual([
      { text: "Open the thread to see what happened." }
    ])
    expect(notificationText(withoutThread(older), known)).toEqual([{ text: "You can no longer see this thread." }])
  })

  it("tells a mention in what a notification says by the name its member has now", () => {
    const asked = saying(mention, `${ThreadMessage.mentionText(member.id, "Al")} can you take a look?`)

    expect(notificationText({ ...itemOf(older), message: Option.some(asked) }, known)).toEqual([
      { text: "@Alice", isMention: true },
      { text: " can you take a look?" }
    ])
    expect(notificationText({ ...itemOf(older), message: Option.some(asked) }, listed)).toEqual([
      { text: "@Al", isMention: true },
      { text: " can you take a look?" }
    ])
  })

  it("lists every notification, or the ones still waiting, newest first, and counts those waiting", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedInbox({ items: [itemOf(older), itemOf(seen), itemOf(newer)] })),
      model((model) => {
        expect(idsOf(shownItems(model))).toEqual([seen.id, newer.id, older.id])
        expect(waitingCount(model)).toBe(2)
        expect(Option.map(newestWaiting(model), ({ id }) => id)).toEqual(Option.some(newer.id))
      }),
      message(Message.ChoseTab({ tab: "Unread" })),
      model((model) => {
        expect(model.tab).toBe("Unread")
        expect(idsOf(shownItems(model))).toEqual([newer.id, older.id])
      }),
      message(Message.ReceivedInbox({ items: [itemOf(seen)] })),
      model((model) => {
        expect(waitingCount(model)).toBe(0)
        expect(shownItems(model)).toEqual([])
      }),
      message(Message.ChoseTab({ tab: "All" })),
      model((model) => {
        expect(model.tab).toBe("All")
        expect(shownItems(model).length).toBe(1)
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

  it("opens the thread of a waiting notification beside the inbox, marks it seen, and reports it", () => {
    story(
      update,
      given(known),
      message(Message.ReceivedInbox({ items: [itemOf(older), itemOf(newer), itemOf(apart)] })),
      model((model) => {
        expect(model.selected).toEqual(Option.none())
      }),
      message(Message.ClickedOpen({ notificationId: older.id })),
      Command.expectExact(MarkNotificationSeen({ ...asMember, notificationId: older.id }), ReadDraft),
      expectOutMessage(OutMessage.OpenedThread()),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(
          Option.map(model.selected, ({ notificationId, threadId, groupId, messageId, model: open }) => [
            notificationId,
            threadId,
            groupId,
            messageId,
            open.threadId
          ])
        ).toEqual(Option.some([older.id, thread.id, general.id, Option.some(reply.id), thread.id]))
      })
    )
  })

  it("opens the thread of a notification that was seen without writing it seen again", () => {
    story(
      update,
      given(known),
      message(Message.ReceivedInbox({ items: [itemOf(seen), itemOf(newer)] })),
      message(Message.ClickedOpen({ notificationId: seen.id })),
      Command.expectExact(ReadDraft),
      expectOutMessage(OutMessage.OpenedThread()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Option.map(model.selected, ({ notificationId }) => notificationId)).toEqual(Option.some(seen.id))
      })
    )
  })

  it("opens nothing for a notification from no thread, or one the inbox does not hold", () => {
    story(
      update,
      given(known),
      message(Message.ReceivedInbox({ items: [itemOf(older), itemOf(apart)] })),
      message(Message.ClickedOpen({ notificationId: apart.id })),
      expectNoOutMessage(),
      Command.expectNone(),
      message(Message.ClickedOpen({ notificationId: seen.id })),
      expectNoOutMessage(),
      Command.expectNone(),
      model((model) => {
        expect(model.selected).toEqual(Option.none())
      })
    )
  })

  it("selects the notification opened next in place of the one opened before, and closing clears it, reporting that", () => {
    story(
      update,
      given(known),
      message(Message.ReceivedInbox({ items: [itemOf(older), itemOf(newer)] })),
      message(Message.ClickedOpen({ notificationId: older.id })),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.ClickedOpen({ notificationId: newer.id })),
      expectOutMessage(OutMessage.OpenedThread()),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Option.map(model.selected, ({ notificationId }) => notificationId)).toEqual(Option.some(newer.id))
      }),
      message(Message.ClickedClose()),
      expectOutMessage(OutMessage.ClosedThread()),
      Command.expectNone(),
      model((model) => {
        expect(model.selected).toEqual(Option.none())
      })
    )
  })

  it("closes the thread when its parent asks, which the parent already knows", () => {
    story(
      update,
      given(known),
      message(Message.ReceivedInbox({ items: [itemOf(older)] })),
      message(Message.ClickedOpen({ notificationId: older.id })),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.RequestedCloseThread()),
      expectNoOutMessage(),
      Command.expectNone(),
      model((model) => {
        expect(model.selected).toEqual(Option.none())
      }),
      message(Message.RequestedCloseThread()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.selected).toEqual(Option.none())
      })
    )
  })

  it("keeps the notification opened in its place on Unread while its thread is open, and counts only what waits", () => {
    story(
      update,
      given(known),
      message(Message.ReceivedInbox({ items: [itemOf(older), itemOf(newer), itemOf(seen)] })),
      message(Message.ChoseTab({ tab: "Unread" })),
      message(Message.ClickedOpen({ notificationId: older.id })),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      // Once the store reports it seen it no longer waits, yet it stays among those shown, where it was.
      message(Message.ReceivedInbox({ items: [markedSeen(itemOf(older)), itemOf(newer), itemOf(seen)] })),
      model((model) => {
        expect(idsOf(shownItems(model))).toEqual([newer.id, older.id])
        expect(waitingCount(model)).toBe(1)
      }),
      message(Message.ClickedOpen({ notificationId: newer.id })),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.ReceivedInbox({ items: [markedSeen(itemOf(older)), markedSeen(itemOf(newer)), itemOf(seen)] })),
      model((model) => {
        expect(idsOf(shownItems(model))).toEqual([newer.id])
        expect(waitingCount(model)).toBe(0)
      }),
      message(Message.ClickedClose()),
      model((model) => {
        expect(shownItems(model)).toEqual([])
      })
    )
  })

  it("keeps the notification opened on All among every one, and in its place by when it came", () => {
    story(
      update,
      given(known),
      message(Message.ReceivedInbox({ items: [itemOf(older), itemOf(seen), itemOf(newer)] })),
      message(Message.ClickedOpen({ notificationId: newer.id })),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(idsOf(shownItems(model))).toEqual([seen.id, newer.id, older.id])
      })
    )
  })

  it("finds the group of a thread while the store holds it", () => {
    expect(findGroup(known, general.id)).toEqual(Option.some(general))
    expect(findGroup(listed, general.id)).toEqual(Option.none())
  })

  it("marks every notification seen through the newest that waits, which keeps the thread open", () => {
    story(
      update,
      given(known),
      message(Message.ReceivedInbox({ items: [itemOf(newer), itemOf(older)] })),
      message(Message.ClickedOpen({ notificationId: older.id })),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.ClickedMarkAllSeen()),
      Command.expectExact(
        MarkAllNotificationsSeen({ ...asMember, through: { recordedAt: newer.recordedAt, id: newer.id } })
      ),
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAction()),
      model((model) => {
        expect(Option.map(model.selected, ({ notificationId }) => notificationId)).toEqual(Option.some(older.id))
      }),
      message(Message.ReceivedInbox({ items: [itemOf(seen)] })),
      message(Message.ClickedMarkAllSeen()),
      Command.expectNone()
    )
  })

  it("says why a write could not be kept, until one is", () => {
    story(
      update,
      given(known),
      message(Message.ReceivedInbox({ items: [itemOf(older)] })),
      message(Message.ClickedOpen({ notificationId: older.id })),
      Command.resolve(
        MarkNotificationSeen,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      }),
      message(Message.ClickedMarkAllSeen()),
      Command.resolve(
        MarkAllNotificationsSeen,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      message(Message.ClickedOpen({ notificationId: older.id })),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
      })
    )
  })
})
