import { GroupId } from "@amends-dev/core/group"
import { Notification } from "@amends-dev/core/notification"
import { ThreadMessage } from "@amends-dev/core/thread"
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
  thread
} from "../../../test/fixtures.ts"
import { ComposerBlock } from "../composer/block.ts"
import { ReadDraft } from "../composer/command.ts"
import { init as initThread } from "../thread/init.ts"
import { InboxBlock } from "./block.ts"
import { MarkAllNotificationsSeen, MarkNotificationSeen } from "./command.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { threadView, view } from "./view.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }

const sceneView = withViewInputs(view, { now })()
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

/** The inbox read, with the notification, general, and the workspace's members. */
const opened = modifyFields(init(workspace.id, member.id).model, {
  items: () => [bobsReply],
  groups: () => [general],
  members: () => [member, bob]
})

/** The thread of the notification read, with its opening and Bob's reply, which the notification tells of. */
const threadRead = modifyFields(initThread(workspace.id, member.id, thread.id).model, {
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

/** The inbox with the notification's thread open beside it. */
const openedThread = modifyFields(opened, { selected: () => selectedOf(notification.id) })

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
      expect(text("Notifications about your threads arrive here.")).toBeAbsent()
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
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAction()),
      // Once the store reports it seen, it is on All with nothing to do about it.
      Subscription.emit(subscriptions.inbox, Message.ReceivedInbox({ items: [seen(bobsReply)] })),
      expect(within(notifications, role("button", { name: "Bob replied" }))).toExist(),
      expect(within(notifications, text("Unread"))).toBeAbsent(),
      expect(role("button", { name: "Mark seen" })).toBeAbsent(),
      expect(role("button", { name: "Mark all seen" })).toBeAbsent(),
      expect(role("tab", { name: "Unread" })).toHaveText("Unread"),
      expect(role("tab", { name: "Unread" })).not.toHaveAttr("aria-description"),
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

  it("says that a message was deleted where it would say what it said", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(opened, { items: () => [{ ...bobsReply, message: Option.some(deleted(reply)) }] })),
      expect(role("button", { name: "Bob replied" })).toHaveAttr("aria-description", "This message was deleted.")
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
      expect(role("tab", { name: "Unread" })).toHaveText("Unread"),
      expect(role("tab", { name: "Unread" })).not.toHaveAttr("aria-description"),
      expect(within(notifications, role("button", { name: "Bob replied" }))).toExist(),
      expect(within(notifications, text("Unread"))).toBeAbsent(),
      expect(role("button", { name: "Mark all seen" })).toBeAbsent(),
      expect(role("heading", { name: "You're all caught up", level: 2 })).toBeAbsent(),
      expect(role("complementary", { name: "Thread" })).toExist(),
      // Closing the panel clears the selection, and with nothing waiting the inbox is caught up.
      click(role("button", { name: "Close" })),
      expectOutMessage(OutMessage.ClosedThread()),
      expect(role("complementary", { name: "Thread" })).toBeAbsent(),
      expect(notifications).toBeAbsent(),
      expect(role("heading", { name: "You're all caught up", level: 2 })).toExist(),
      expect(text("Nothing new.")).toExist()
    )
  })

  it("keeps Mark all seen in the header while anything waits, which keeps the thread open and the row selected", () => {
    const other = { ...bobsReply, notification: notificationOf("notification-2", 3, 6) }

    scene(
      { update, view: withSidePane },
      given(modifyFields(opened, { items: () => [bobsReply, other], selected: () => selectedOf(notification.id) })),
      expect(role("button", { name: "Mark all seen" })).toExist(),
      click(role("button", { name: "Mark all seen" })),
      Command.expectExact(
        MarkAllNotificationsSeen({
          ...asMember,
          through: { recordedAt: other.notification.recordedAt, id: other.notification.id }
        })
      ),
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAction()),
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

/** The side pane in a page of its own, so that the scene has a view while no thread is open. */
const sidePane = (model: Parameters<typeof sceneThreadView>[0], h: Parameters<typeof sceneThreadView>[1]) =>
  h.div([], [sceneThreadView(model, h)])

describe("the inbox's side pane", () => {
  const pane = role("complementary", { name: "Thread" })

  it("is the complementary landmark named Thread, titled by the thread, saying which group it is in", () => {
    scene(
      { update, view: sceneThreadView },
      given(openedThread),
      expect(pane).toExist(),
      expect(within(pane, role("heading", { name: "Composer paste crash", level: 2 }))).toExist(),
      expect(within(pane, text("Thread in #General"))).toExist(),
      expect(within(pane, role("region", { name: "Thread" }))).toExist()
    )
  })

  it("says Thread in a conversation by the others in it, and only Thread while the store lacks the group", () => {
    scene(
      { update, view: sceneThreadView },
      given(
        modifyFields(openedThread, {
          groups: () => [conversationWithBob],
          selected: Option.map((selected) => ({ ...selected, groupId: conversationWithBob.id }))
        })
      ),
      expect(within(pane, text("Thread in Bob"))).toExist(),
      expect(within(pane, text("Thread in #General"))).toBeAbsent()
    )
    scene(
      { update, view: sceneThreadView },
      given(modifyFields(openedThread, { groups: () => [] })),
      expect(within(pane, text("Thread"))).toExist(),
      expect(within(pane, text(/Thread in/))).toBeAbsent()
    )
  })

  it("shows the thread's messages and draws the one the notification is about as current", () => {
    scene(
      { update, view: sceneThreadView },
      given(openedThread),
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

  it("holds the composer to reply in its footer", () => {
    scene(
      { update, view: sceneThreadView },
      given(openedThread),
      expect(within(pane, role("form", { name: "Reply" }))).toExist(),
      expect(label("Reply")).toHaveAttr("placeholder", "Reply in thread")
    )
  })

  it("closes with a button named Close, and goes back with one named Back, each reporting it", () => {
    for (const name of ["Close", "Back"]) {
      scene(
        { update, view: sidePane },
        given(openedThread),
        expect(within(pane, role("button", { name }))).toExist(),
        click(within(pane, role("button", { name }))),
        expectOutMessage(OutMessage.ClosedThread()),
        expect(role("complementary")).toBeAbsent()
      )
    }
  })

  it("renders nothing while no thread is open", () => {
    scene({ update, view: sidePane }, given(opened), expect(role("complementary")).toBeAbsent())
  })
})
