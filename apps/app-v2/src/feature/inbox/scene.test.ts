import { GroupId } from "@amends-dev/core/group"
import { Notification } from "@amends-dev/core/notification"
import { ThreadMessage } from "@amends-dev/core/thread"
import { describe, it } from "@effect/vitest"
import { DateTime, Option, Struct } from "effect"
import {
  Command,
  Mount,
  Subscription,
  all,
  click,
  expect,
  expectAll,
  expectOutMessage,
  given,
  label,
  nth,
  role,
  scene,
  selector,
  text,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  bob,
  conversationWithBob,
  deleted,
  general,
  membership,
  mention,
  notificationOf,
  now,
  opening,
  reply,
  saying,
  scout,
  task,
  thread,
  turnOf
} from "../../../test/fixtures.ts"
import { ComposerBlock } from "../composer/block.ts"
import { ReadDraft } from "../composer/command.ts"
import { ThreadBlock } from "../thread/block.ts"
import { RevealHighlightedMessage, ScrollMessagesToEnd } from "../thread/command.ts"
import { init as initThread } from "../thread/init.ts"
import { LogState } from "../turns/definition.ts"
import { InboxBlock } from "./block.ts"
import { MarkAllNotificationsSeen, MarkNotificationSeen } from "./command.ts"
import { Message, OutMessage, pageSize } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { threadView, view } from "./view.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }

const sceneView = withViewInputs(view, { now, workspaceName: "Mercier & Co" })()
const sceneThreadView = withViewInputs(threadView, { now })()

/** The inbox with its side pane beside it, as the page puts them, which holds nothing while no thread is open. */
const withSidePane = (model: Parameters<typeof sceneView>[0], h: Parameters<typeof sceneView>[1]) =>
  h.div([], [sceneView(model, h), sceneThreadView(model, h)])

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

/** The inbox as it opens, on Unread, read, with the notification, general, and the workspace's members. */
const readOnUnread = modifyFields(init(workspace.id, member.id).model, {
  isLoaded: () => true,
  items: () => [bobsReply],
  groups: () => [general],
  members: () => [member, bob]
})

/** The inbox read, on All, which lists the notifications that were seen too. */
const opened = modifyFields(readOnUnread, { tab: () => "All" })

/** The thread of the notification read, with its opening and Bob's reply, which the notification tells of. */
const threadRead = modifyFields(initThread(workspace.id, member.id, thread.id).model, {
  isLoaded: () => true,
  hasThread: () => true,
  title: () => Option.some("Composer paste crash"),
  messages: () => [
    { message: opening, pending: false },
    { message: reply, pending: false }
  ],
  members: () => [member, bob]
})

/** The notification `notificationId` opened, with the thread read and the reply highlighted. */
const selectedOf = (notificationId: Notification.NotificationId) =>
  Option.some({
    notificationId,
    threadId: thread.id,
    groupId: general.id,
    messageId: Option.some(reply.id),
    model: threadRead
  })

/** `count` notifications of Bob's reply, a minute apart, as the store gives them. */
const many = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    ...bobsReply,
    notification: notificationOf(`notification-${index + 1}`, 2, 5 + index)
  }))

/** The inbox with the notification's thread open beside it. */
const openedThread = modifyFields(opened, { selected: () => selectedOf(notification.id) })

/** The thread's highlighted message revealed, as it is whenever a thread opens at a message. */
const revealed = Mount.resolve(RevealHighlightedMessage, ThreadBlock.Message.CompletedRevealHighlightedMessage())

/** The thread's reply draft read, as it is whenever a thread opens. */
const draftRead = Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" }))

/** The write that marks a notification seen acknowledged, as it is whenever a notification that waits is opened. */
const seenWritten = Command.resolve(MarkNotificationSeen, Message.WroteAction())

const notifications = role("list", { name: "Notifications" })

/** The row of the notification currently selected, if any. */
const current = selector('[aria-current="true"]')

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
      expect(text("No activity yet")).toBeAbsent(),
      expect(role("status")).toBeAbsent()
    )
  })

  it("opens on Unread, with the tabs Unread and then All, and lists only what waits under it", () => {
    const seenMention = {
      ...seen(bobsReply),
      notification: { ...seen(bobsReply).notification, id: Notification.NotificationId.make("notification-2") },
      message: Option.some(mention)
    }

    scene(
      { update, view: sceneView },
      given(modifyFields(readOnUnread, { items: () => [bobsReply, seenMention] })),
      expect(nth(all.role("tab"), 0)).toHaveText("Unread1"),
      expect(nth(all.role("tab"), 1)).toHaveText("All"),
      expect(role("tab", { name: "Unread" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-selected", "false"),
      expect(role("button", { name: "Bob replied" })).toExist(),
      expect(role("button", { name: "Bob mentioned you" })).toBeAbsent(),
      click(role("tab", { name: "All" })),
      expect(role("button", { name: "Bob mentioned you" })).toExist()
    )
  })

  it("counts Unread even when nothing waits", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(readOnUnread, { items: () => [seen(bobsReply)] })),
      expect(role("tab", { name: "Unread" })).toHaveText("Unread0"),
      expect(role("tab", { name: "Unread" })).toHaveAttr("aria-description", "0"),
      expect(role("tab", { name: "All" })).toHaveText("All"),
      expect(role("tab", { name: "All" })).not.toHaveAttr("aria-description")
    )
  })

  it("sets each day's name before one rule that runs on, not between two", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(within(notifications, text("Today"))).toExist(),
      expectAll(all.selector("li div.border-dashed")).toHaveCount(1)
    )
  })

  it("dims Mark all seen while the write is on its way, and offers it again if the write fails", () => {
    scene(
      { update, view: sceneView, subscriptions: InboxBlock.subscriptions },
      given(opened),
      expect(role("button", { name: "Mark all seen" })).not.toBeDisabled(),
      click(role("button", { name: "Mark all seen" })),
      expect(role("button", { name: "Mark all seen" })).toBeDisabled(),
      Command.resolve(
        MarkAllNotificationsSeen,
        Message.FailedWriteAllSeen({ error: "This browser could not keep that. Try again." })
      ),
      expect(role("button", { name: "Mark all seen" })).not.toBeDisabled(),
      expect(role("alert")).toHaveText("This browser could not keep that. Try again."),
      click(role("button", { name: "Mark all seen" })),
      expect(role("button", { name: "Mark all seen" })).toBeDisabled(),
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAllSeen()),
      expect(role("button", { name: "Mark all seen" })).not.toBeDisabled(),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("marks each notification with the letters of its author on their tone, an agent's on the lilac", () => {
    const fromScout = {
      ...bobsReply,
      notification: notificationOf("notification-2", 3, 6),
      message: Option.some({ ...reply, author: ThreadMessage.Author.cases.Member.make({ memberId: scout.id }) })
    }

    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [bobsReply, fromScout], members: () => [member, bob, scout] })),
      expect(within(item(2), selector("span.bg-avatar-neutral-bg"))).toHaveText("B"),
      expect(within(item(1), selector("span.bg-avatar-lilac-bg"))).toHaveText("S")
    )
  })

  it("names the workspace it is given under the title for phones", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("heading", { name: "Inbox", level: 1 })).toExist(),
      expect(within(role("main"), text("Mercier & Co"))).toHaveClass("max-tablet:block"),
      expect(within(role("main"), text("Mercier & Co"))).toHaveClass("hidden")
    )
  })

  it("marks them all seen, then keeps them on All without a dot, and shows none on Unread", () => {
    scene(
      { update, view: sceneView, subscriptions: InboxBlock.subscriptions },
      given(opened),
      expect(role("tab", { name: "Unread" })).toHaveText("Unread1"),
      expect(role("tab", { name: "Unread" })).toHaveAttr("aria-description", "1"),
      expect(within(notifications, text("Unread"))).toExist(),
      click(role("button", { name: "Mark all seen" })),
      Command.expectExact(
        MarkAllNotificationsSeen({ ...asMember, through: { recordedAt: notification.recordedAt, id: notification.id } })
      ),
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAllSeen()),
      // Once the store reports it seen, it is on All with nothing to do about it.
      Subscription.emit(subscriptions.inbox, Message.ReceivedInbox({ items: [seen(bobsReply)] })),
      expect(within(notifications, role("button", { name: "Bob replied" }))).toExist(),
      expect(within(notifications, text("Unread"))).toBeAbsent(),
      expect(role("button", { name: "Mark seen" })).toBeAbsent(),
      expect(role("button", { name: "Mark all seen" })).toBeAbsent(),
      expect(role("tab", { name: "Unread" })).toHaveText("Unread0"),
      expect(role("tab", { name: "Unread" })).toHaveAttr("aria-description", "0"),
      click(role("tab", { name: "Unread" })),
      expect(role("tab", { name: "Unread" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-selected", "false"),
      expect(role("heading", { name: "You're all caught up", level: 2 })).toExist(),
      expect(text("You've seen everything that came to you.")).toExist(),
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
      expectAll(all.text("Unread")).toHaveCount(2),
      click(role("tab", { name: "Unread" })),
      expect(role("button", { name: "Bob replied" })).toExist(),
      expect(role("button", { name: "Bob mentioned you" })).toBeAbsent(),
      click(role("tab", { name: "All" })),
      expect(role("button", { name: "Bob mentioned you" })).toExist()
    )
  })

  it("lists the newest page of notifications, with Show older after them until the person asks for the rest", () => {
    const bobsReplies = all.role("button", { name: "Bob replied" })

    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => many(pageSize + 1) })),
      expectAll(bobsReplies).toHaveCount(pageSize),
      expect(role("button", { name: "Show older" })).toExist(),
      click(role("button", { name: "Show older" })),
      Command.expectNone(),
      expectAll(bobsReplies).toHaveCount(pageSize + 1),
      expect(role("button", { name: "Show older" })).toBeAbsent()
    )
  })

  it("shows no Show older while the tab holds no more than a page of notifications", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => many(pageSize) })),
      expectAll(all.role("button", { name: "Bob replied" })).toHaveCount(pageSize),
      expect(role("button", { name: "Show older" })).toBeAbsent()
    )
    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [bobsReply] })),
      expect(role("button", { name: "Show older" })).toBeAbsent()
    )
  })

  it("keeps the page as the tab changes, and offers older notifications only on a tab that keeps them", () => {
    const [waiting, ...earlier] = many(pageSize + 1).toReversed()
    if (waiting === undefined) throw new Error("no notifications")

    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [waiting, ...earlier.map(seen)] })),
      expect(role("button", { name: "Show older" })).toExist(),
      click(role("tab", { name: "Unread" })),
      expectAll(all.role("button", { name: "Bob replied" })).toHaveCount(1),
      expect(role("button", { name: "Show older" })).toBeAbsent(),
      click(role("tab", { name: "All" })),
      expect(role("button", { name: "Show older" })).toExist(),
      click(role("button", { name: "Show older" })),
      click(role("tab", { name: "Unread" })),
      click(role("tab", { name: "All" })),
      expectAll(all.role("button", { name: "Bob replied" })).toHaveCount(pageSize + 1),
      expect(role("button", { name: "Show older" })).toBeAbsent()
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

  it("shows a mention in what a notification says as a chip with the name the member has now, and describes its button by the words", () => {
    const asked = saying(mention, `${ThreadMessage.mentionText(member.id, "Al")} can you take a look?`)

    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [{ ...bobsReply, message: Option.some(asked) }] })),
      expect(within(notifications, text("@Alice"))).toHaveText("@Alice"),
      expect(within(notifications, text(" can you take a look?"))).toExist(),
      expect(text("@Al")).toBeAbsent(),
      expect(role("button", { name: "Bob mentioned you" })).toHaveAttr(
        "aria-description",
        "@Alice can you take a look?"
      )
    )
  })

  it("shows markdown in what a notification says as one run of words, without its layout or syntax", () => {
    const formatted = saying(mention, "# Plan\n\n**Ship** the [retry fix](https://example.com):\n\n- `one`\n- two")

    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [{ ...bobsReply, message: Option.some(formatted) }] })),
      expect(role("button", { name: "Bob mentioned you" })).toHaveAttr(
        "aria-description",
        "Plan Ship the retry fix: one two"
      ),
      expect(within(notifications, text("Plan Ship the retry fix: one two"))).toExist(),
      expect(selector("button strong")).toBeAbsent(),
      expect(selector("button a")).toBeAbsent(),
      expect(selector("button li")).toBeAbsent(),
      expect(selector("button p")).toBeAbsent()
    )
  })

  it("says that a message was deleted where it would say what it said", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [{ ...bobsReply, message: Option.some(deleted(reply)) }] })),
      expect(role("button", { name: "Bob replied" })).toHaveAttr("aria-description", "Message deleted")
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

  it("has no way to mark one notification seen, on a row or in the header, only all of them", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("button", { name: "Mark seen" })).toBeAbsent(),
      expect(role("button", { name: "Mark all seen" })).toExist(),
      expect(current).toBeAbsent()
    )
  })

  it("opens a notification's thread beside the inbox by its text, marking it seen at once", () => {
    scene(
      { update, view: withSidePane },
      given(opened),
      expect(role("complementary", { name: "Thread" })).toBeAbsent(),
      click(role("button", { name: "Bob replied" })),
      Command.expectExact(MarkNotificationSeen({ ...asMember, notificationId: notification.id }), ReadDraft),
      expectOutMessage(OutMessage.OpenedThread()),
      seenWritten,
      draftRead,
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(within(current, text("Bob"))).toExist(),
      expect(within(notifications, role("button", { name: "Bob replied" }))).toExist()
    )
  })

  it("opens the thread of one that was seen without marking it seen again", () => {
    scene(
      { update, view: withSidePane },
      given(modifyFields(opened, { items: () => [seen(bobsReply)] })),
      click(role("button", { name: "Bob replied" })),
      Command.expectExact(ReadDraft),
      expectOutMessage(OutMessage.OpenedThread()),
      draftRead,
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(within(current, text("Bob"))).toExist()
    )
  })

  it("says why the write that marks a notification seen could not be kept, with its thread open all the same", () => {
    scene(
      { update, view: withSidePane },
      given(opened),
      click(role("button", { name: "Bob replied" })),
      Command.resolve(
        MarkNotificationSeen,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      draftRead,
      expect(text("This browser could not keep that. Try again.")).toExist(),
      expect(role("complementary", { name: "Thread" })).toExist()
    )
  })

  it("says only that there was activity in a thread the store lacks, which can still be opened", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [{ ...bobsReply, thread: Option.none(), message: Option.none() }] })),
      expect(text("Activity")).toExist(),
      expect(within(item(1), selector("span.size-8 svg"))).toHaveAttr("aria-hidden", "true"),
      expect(text("?")).toBeAbsent(),
      expect(text("Unavailable thread")).toExist(),
      expect(text("You can no longer see this thread.")).toExist(),
      expect(role("button", { name: "Activity in a thread" })).toExist(),
      click(role("button", { name: "Activity in a thread" })),
      expectOutMessage(OutMessage.OpenedThread()),
      seenWritten,
      draftRead
    )
  })

  it("marks the row of the notification opened as current, in its place, and moves it as another is selected", () => {
    const other = {
      ...bobsReply,
      notification: notificationOf("notification-2", 3, 6),
      message: Option.some(mention)
    }

    scene(
      { update, view: withSidePane },
      given(modifyFields(opened, { items: () => [bobsReply, other] })),
      expect(current).toBeAbsent(),
      click(role("button", { name: "Bob replied" })),
      seenWritten,
      draftRead,
      expect(within(current, role("button", { name: "Bob replied" }))).toExist(),
      expect(within(current, role("button", { name: "Bob mentioned you" }))).toBeAbsent(),
      click(role("button", { name: "Bob mentioned you" })),
      seenWritten,
      draftRead,
      expect(within(current, role("button", { name: "Bob mentioned you" }))).toExist(),
      expect(within(current, role("button", { name: "Bob replied" }))).toBeAbsent(),
      expectAll(all.selector('[aria-current="true"]')).toHaveCount(1),
      expect(within(item(1), role("button", { name: "Bob mentioned you" }))).toExist(),
      expect(within(item(2), role("button", { name: "Bob replied" }))).toExist()
    )
  })

  it("keeps the selected row on Unread once it is seen, which counts only what waits, and no caught-up state while it is shown", () => {
    scene(
      { update, view: withSidePane, subscriptions: InboxBlock.subscriptions },
      given(opened),
      click(role("tab", { name: "Unread" })),
      expect(role("tab", { name: "Unread" })).toHaveText("Unread1"),
      click(role("button", { name: "Bob replied" })),
      seenWritten,
      draftRead,
      Subscription.emit(subscriptions.inbox, Message.ReceivedInbox({ items: [seen(bobsReply)] })),
      expect(role("tab", { name: "Unread" })).toHaveText("Unread0"),
      expect(role("tab", { name: "Unread" })).toHaveAttr("aria-description", "0"),
      expect(within(notifications, role("button", { name: "Bob replied" }))).toExist(),
      expect(within(notifications, text("Unread"))).toBeAbsent(),
      expect(role("button", { name: "Mark all seen" })).toBeAbsent(),
      expect(role("heading", { name: "You're all caught up", level: 2 })).toBeAbsent(),
      expect(role("complementary", { name: "Thread" })).toExist(),
      // Closing the panel clears the selection, and with nothing waiting the inbox is caught up.
      click(role("button", { name: "Close thread" })),
      expectOutMessage(OutMessage.ClosedThread()),
      expect(role("complementary", { name: "Thread" })).toBeAbsent(),
      expect(notifications).toBeAbsent(),
      expect(role("heading", { name: "You're all caught up", level: 2 })).toExist(),
      expect(text("You've seen everything that came to you.")).toExist()
    )
  })

  it("keeps Mark all seen in the header while anything waits, which keeps the thread open and the row selected", () => {
    const other = { ...bobsReply, notification: notificationOf("notification-2", 3, 6) }

    scene(
      { update, view: withSidePane },
      given(modifyFields(opened, { items: () => [bobsReply, other], selected: () => selectedOf(notification.id) })),
      revealed,
      expect(role("button", { name: "Mark all seen" })).toExist(),
      click(role("button", { name: "Mark all seen" })),
      Command.expectExact(
        MarkAllNotificationsSeen({
          ...asMember,
          through: { recordedAt: other.notification.recordedAt, id: other.notification.id }
        })
      ),
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAllSeen()),
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(within(current, text("Bob"))).toExist()
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
      expect(text("Unread")).toExist()
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

  it("says there is no activity yet on All, and that all is caught up on Unread, while nothing waits", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(init(workspace.id, member.id).model, { isLoaded: () => true })),
      expect(role("tab", { name: "Unread" })).toHaveAttr("aria-selected", "true"),
      expect(role("heading", { name: "You're all caught up", level: 2 })).toExist(),
      expect(text("You've seen everything that came to you.")).toExist(),
      expect(selector("svg g.art-breathing")).toExist(),
      expect(role("heading", { name: "No activity yet" })).toBeAbsent(),
      expect(role("button", { name: "Mark all seen" })).toBeAbsent(),
      click(role("button", { name: "View all activity" })),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-selected", "true"),
      expect(role("heading", { name: "No activity yet", level: 2 })).toExist(),
      expect(text("Mentions, replies, and new threads in groups you follow appear here.")).toExist(),
      expect(selector("svg g.art-breathing")).toBeAbsent(),
      expect(selector("svg path.art-caret")).toExist(),
      click(role("tab", { name: "Unread" })),
      expect(role("heading", { name: "You're all caught up", level: 2 })).toExist()
    )
  })

  it("says it is loading until the notifications are read, in a live region, with no list and no empty state", () => {
    scene(
      { update, view: sceneView },
      given(init(workspace.id, member.id).model),
      expect(role("status")).toHaveText("Loading your inbox…"),
      expect(role("heading", { name: "No activity yet" })).toBeAbsent(),
      expect(role("list", { name: "Notifications" })).toBeAbsent(),
      click(role("tab", { name: "Unread" })),
      expect(role("status")).toHaveText("Loading your inbox…"),
      expect(role("heading", { name: "You're all caught up" })).toBeAbsent()
    )
  })

  it("says it could not load the notifications, with why, in place of the loading line, when the first read failed", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(init(workspace.id, member.id).model, {
          notice: () => Option.some("This browser could not read the workspace's copy.")
        })
      ),
      expect(role("heading", { name: "Can't load your inbox", level: 2 })).toExist(),
      expect(text("This browser could not read the workspace's copy.")).toExist(),
      expect(role("alert")).toBeAbsent(),
      expect(role("status")).toBeAbsent(),
      expect(selector("svg g.art-swinging")).toExist(),
      expect(role("button", { name: "Try again" })).toExist()
    )
  })

  it("reads the notifications again when the person tries again, with the loading line in the meantime", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(init(workspace.id, member.id).model, {
          notice: () => Option.some("This browser could not read the workspace's copy.")
        })
      ),
      click(role("button", { name: "Try again" })),
      expect(role("heading", { name: "Can't load your inbox" })).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toBeAbsent(),
      expect(role("status")).toHaveText("Loading your inbox…")
    )
  })

  it("keeps the notifications it read and says why a later read failed", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { notice: () => Option.some("This browser could not read the workspace's copy.") })),
      expect(role("alert")).toHaveText("This browser could not read the workspace's copy."),
      expect(role("button", { name: "Bob replied" })).toExist(),
      expect(role("heading", { name: "Can't load your inbox" })).toBeAbsent()
    )
  })
})

/** The side pane in a page of its own, so that the scene has a view while no thread is open. */
const sidePane = (model: Parameters<typeof sceneThreadView>[0], h: Parameters<typeof sceneThreadView>[1]) =>
  h.div([], [sceneThreadView(model, h)])

describe("the inbox's side pane", () => {
  const pane = role("complementary", { name: "Thread" })

  it("is the complementary landmark named Thread, titled by the thread, saying why it came and from which group", () => {
    scene(
      { update, view: sceneThreadView },
      given(openedThread),
      revealed,
      expect(pane).toExist(),
      expect(within(pane, role("heading", { name: "Composer paste crash", level: 2 }))).toExist(),
      expect(within(pane, text("Reply · #General"))).toExist(),
      expect(within(pane, role("region", { name: "Thread" }))).toExist()
    )
  })

  it("says Mention when the message addresses the person, and New thread when it opens the thread", () => {
    scene(
      { update, view: sceneThreadView },
      given(modifyFields(openedThread, { items: () => [{ ...bobsReply, message: Option.some(mention) }] })),
      revealed,
      expect(within(pane, text("Mention · #General"))).toExist()
    )
    scene(
      { update, view: sceneThreadView },
      given(modifyFields(openedThread, { items: () => [{ ...bobsReply, message: Option.some(opening) }] })),
      revealed,
      expect(within(pane, text("New thread · #General"))).toExist()
    )
  })

  it("says the reason with a conversation by the others in it, and only the reason while the store lacks the group", () => {
    scene(
      { update, view: sceneThreadView },
      given(
        modifyFields(openedThread, {
          groups: () => [conversationWithBob],
          selected: Option.map((selected) => ({ ...selected, groupId: conversationWithBob.id }))
        })
      ),
      revealed,
      expect(within(pane, text("Reply · Bob"))).toExist(),
      expect(within(pane, text("Reply · #General"))).toBeAbsent()
    )
    scene(
      { update, view: sceneThreadView },
      given(modifyFields(openedThread, { groups: () => [] })),
      revealed,
      expect(within(pane, text("Reply"))).toExist(),
      expect(within(pane, text(/Reply ·/))).toBeAbsent()
    )
  })

  it("says where the thread is when the store lacks the message the notification is about", () => {
    scene(
      { update, view: sceneThreadView },
      given(modifyFields(openedThread, { items: () => [{ ...bobsReply, message: Option.none() }] })),
      revealed,
      expect(within(pane, text("Thread in #General"))).toExist()
    )
  })

  it("is the complementary landmark named Task for a thread that tracks one, back to the inbox", () => {
    scene(
      { update, view: sceneThreadView },
      given(
        modifyFields(openedThread, {
          selected: Option.map((selected) => ({
            ...selected,
            model: modifyFields(selected.model, {
              task: (taskModel) =>
                modifyFields(taskModel, {
                  task: () => Option.some({ task: { ...task, threadId: thread.id }, pending: false })
                })
            })
          }))
        })
      ),
      revealed,
      expect(pane).toBeAbsent(),
      expect(within(role("complementary", { name: "Task" }), text("Reply · #General"))).toExist(),
      expect(within(role("complementary", { name: "Task" }), role("button", { name: "Close task" }))).toExist(),
      expect(within(role("complementary", { name: "Task" }), role("button", { name: "Back to Inbox" }))).toExist()
    )
  })

  it("offers the bell that follows the thread in its header", () => {
    scene(
      { update, view: sceneThreadView },
      given(openedThread),
      revealed,
      expect(within(pane, role("button", { name: "Follow thread" }))).toExist()
    )
  })

  it("shows the thread's messages and draws the one the notification is about as current", () => {
    scene(
      { update, view: sceneThreadView },
      given(openedThread),
      revealed,
      expect(within(pane, role("list", { name: "Messages" }))).toExist(),
      expect(within(pane, text("Plans for the week"))).toExist(),
      expect(within(pane, text("Sounds good"))).toExist(),
      expect(within(current, text("Sounds good"))).toExist(),
      expect(within(current, text("Plans for the week"))).toBeAbsent(),
      expectAll(all.selector('[aria-current="true"]')).toHaveCount(1)
    )
  })

  it("draws no message current while the notification is about none the store holds", () => {
    scene(
      { update, view: sceneThreadView },
      given(
        modifyFields(openedThread, {
          selected: Option.map((selected) => ({ ...selected, messageId: Option.none() }))
        })
      ),
      expect(within(pane, text("Sounds good"))).toExist(),
      expect(current).toBeAbsent()
    )
  })

  it("rests the thread's messages against the composer, anchored to the bottom, and a task's activity at the top", () => {
    scene(
      { update, view: sceneThreadView },
      given(openedThread),
      revealed,
      expect(within(pane, selector('[data-anchor="bottom"]'))).toExist(),
      expect(within(selector('[data-anchor="bottom"]'), role("list", { name: "Messages" }))).toExist()
    )
    scene(
      { update, view: sceneThreadView },
      given(
        modifyFields(openedThread, {
          selected: Option.map((selected) => ({
            ...selected,
            model: modifyFields(selected.model, {
              task: (taskModel) =>
                modifyFields(taskModel, {
                  task: () => Option.some({ task: { ...task, threadId: thread.id }, pending: false })
                })
            })
          }))
        })
      ),
      revealed,
      expect(selector('[data-anchor="bottom"]')).toBeAbsent()
    )
  })

  it("holds the composer to reply in its footer", () => {
    scene(
      { update, view: sceneThreadView },
      given(openedThread),
      revealed,
      expect(within(pane, role("form", { name: "Reply in thread" }))).toExist(),
      expect(label("Reply in thread")).toHaveAttr("placeholder", "Reply in thread")
    )
  })

  it("closes with a button named Close thread, and goes back with one named for the inbox, each reporting it", () => {
    for (const name of ["Close thread", "Back to Inbox"]) {
      scene(
        { update, view: sidePane },
        given(openedThread),
        revealed,
        expect(within(pane, role("button", { name }))).toExist(),
        click(within(pane, role("button", { name }))),
        expectOutMessage(OutMessage.ClosedThread()),
        expect(role("complementary")).toBeAbsent(),
        Mount.expectEnded(RevealHighlightedMessage)
      )
    }
  })

  it("renders nothing while no thread is open", () => {
    scene({ update, view: sidePane }, given(opened), expect(role("complementary")).toBeAbsent())
  })
})

describe("the inbox's side pane, while the log of a turn is followed", () => {
  const replied = turnOf("turn-1", "completed", { messageIds: ["message-2"], finishedAt: "2026-10-18T12:07:00Z" })

  /** The inbox with the notification's thread open and the log of `turn`, in `state`, followed. */
  const withLogOf = (turn: typeof replied, state: LogState) =>
    modifyFields(opened, {
      selected: () =>
        Option.map(selectedOf(notification.id), (selected) => ({
          ...selected,
          model: modifyFields(selected.model, {
            turns: (turns) =>
              modifyFields(turns, {
                turns: () => [{ turn, pending: false, retryOpen: false }],
                members: () => [member, bob, scout],
                log: () => Option.some({ turnId: turn.id, items: [], state, hasNewActivity: false })
              })
          })
        }))
    })

  const withTurnLog = withLogOf(replied, LogState.Following())

  it("is the turn log in place of the thread, saying where the thread is", () => {
    scene(
      { update, view: sidePane },
      given(withTurnLog),
      expect(role("complementary", { name: "Turn log" })).toExist(),
      expect(within(role("complementary", { name: "Turn log" }), text("Thread in #General"))).toExist(),
      expect(role("complementary", { name: "Thread" })).toBeAbsent()
    )
  })

  it("goes back to the thread, which shows no log", () => {
    scene(
      { update, view: sidePane },
      given(withTurnLog),
      click(role("button", { name: "Back to thread" })),
      Command.expectExact(ScrollMessagesToEnd({ threadId: thread.id, onlyIfNearEnd: false })),
      Command.resolve(ScrollMessagesToEnd, ThreadBlock.Message.CompletedScrollMessagesToEnd()),
      revealed,
      expect(role("complementary", { name: "Turn log" })).toBeAbsent(),
      expect(role("complementary", { name: "Thread" })).toExist()
    )
  })

  it("closes the thread with the log, which the page is told", () => {
    scene(
      { update, view: sidePane },
      given(withTurnLog),
      click(role("button", { name: "Close turn log" })),
      expectOutMessage(OutMessage.ClosedThread()),
      expect(role("complementary")).toBeAbsent()
    )
  })

  it("tells the page which agent's settings the person asked for, and keeps the thread and its log as they are", () => {
    const failedTurn = turnOf("turn-2", "failed", { finishedAt: "2026-10-18T12:09:00Z" })

    scene(
      { update, view: sidePane },
      given(withLogOf(failedTurn, LogState.Ended())),
      click(role("button", { name: "Agent settings" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: failedTurn.agentId })),
      expect(role("complementary", { name: "Turn log" })).toExist()
    )
  })
})
