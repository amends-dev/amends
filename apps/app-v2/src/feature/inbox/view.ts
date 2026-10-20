import { button, buttonRow, loadingLine, notice } from "@amends-dev/design/control"
import { divider, messageList, notification } from "@amends-dev/design/message"
import { pane, paneBack, paneClose, paneColumn, paneEmpty, paneTabs } from "@amends-dev/design/pane"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { ageLabel, threadSubtitle } from "../../seen.ts"
import { titleOf } from "../thread/definition.ts"
import { replyView } from "../thread/view.ts"
import { InboxComposition, type InboxViewBuilder, ThreadBinding } from "./composition.ts"
import {
  byDay,
  findGroup,
  hasOlderItems,
  type InboxItem,
  isSelected,
  isWaiting,
  Message,
  type Model,
  notificationHeadline,
  notificationPlace,
  notificationText,
  shownItems,
  type Tab,
  waitingCount
} from "./definition.ts"

/** The time now, which the days the notifications came on and how long ago they came are read from. */
export type ViewInputs = Readonly<{ now: DateTime.Utc }>

/** What the body says when a tab has nothing to list; on Unread, with the way to see what was seen. */
const nothingToList = (tab: Tab, h: InboxViewBuilder): Html =>
  tab === "Unread"
    ? paneEmpty(h, {
        art: "rest",
        title: "You're all caught up",
        copy: "You've seen everything that came to you.",
        action: button(h, "View all activity", Message.ChoseTab({ tab: "All" }))
      })
    : paneEmpty(h, {
        art: "caret",
        title: "No activity yet",
        copy: "Mentions, replies, and new threads in groups you follow appear here."
      })

/** Whether the notifications could not be read, which is why there are none to show: nothing was read, and why. */
const isUnread = (model: Model): boolean => !model.isLoaded && Option.isSome(model.notice)

/** What the body says in place of the notifications when they could not be read: why, as the line under the title. */
const unreadInbox = (model: Model, h: InboxViewBuilder): Html =>
  paneEmpty(h, {
    art: "came-apart",
    title: "Can't load your inbox",
    ...Option.match(model.notice, { onNone: () => ({}), onSome: (copy) => ({ copy }) }),
    action: button(h, "Try again", Message.ClickedTryAgain())
  })

/** The tabs under the title: every notification, and those waiting, counted while any wait. */
const tabs = (model: Model, h: InboxViewBuilder): Html => {
  const waiting = waitingCount(model)

  return paneTabs(h, {
    label: "Inbox",
    tabs: [
      { label: "All", isCurrent: model.tab === "All", onClick: Message.ChoseTab({ tab: "All" }) },
      {
        label: "Unread",
        ...(waiting > 0 ? { count: waiting } : {}),
        isCurrent: model.tab === "Unread",
        onClick: Message.ChoseTab({ tab: "Unread" })
      }
    ]
  })
}

/**
 * A notification as the design's row: the author of what its activity is about and what they did, where it
 * comes from, and what it says, which opens its thread, if it has one, how long ago it came, and, while it
 * waits, unread, and current while it is the one whose thread is open.
 */
const notificationRow = (item: InboxItem, model: Model, now: DateTime.Utc, h: InboxViewBuilder): Html => {
  const { id, recordedAt, thread } = item.notification

  return notification(h, {
    key: id,
    ...notificationHeadline(item, model),
    place: Option.getOrUndefined(notificationPlace(item, model)),
    text: notificationText(item, model),
    age: ageLabel(recordedAt, now),
    isUnread: isWaiting(item),
    isCurrent: isSelected(model, item),
    ...(thread === undefined ? {} : { onOpen: Message.ClickedOpen({ notificationId: id }) })
  })
}

/**
 * The notifications the tab lists, newest first, under the days they came, or what the body says in their place:
 * that they are being read, why they could not be, or that the tab has none.
 */
const notifications = (model: Model, now: DateTime.Utc, h: InboxViewBuilder): Html => {
  if (isUnread(model)) {
    return unreadInbox(model, h)
  }

  if (!model.isLoaded) {
    return loadingLine(h, "Loading your inbox…")
  }

  const items = shownItems(model)

  return items.length === 0
    ? nothingToList(model.tab, h)
    : messageList(h, {
        label: "Notifications",
        children: byDay(items, now).flatMap((day) => [
          divider(h, day.label),
          ...day.items.map((item) => notificationRow(item, model, now, h))
        ])
      })
}

/**
 * The notifications the tab lists, newest first, under the days they came, to open beside the inbox, with the one
 * open kept in its place, and Show older after them while the tab keeps older ones, or what a tab says when it has
 * none, and a line that says they are being read until they are.
 */
export const view = InboxComposition.makeView.withInputs<ViewInputs>((model, { now }, h) =>
  pane(h, {
    variant: "main",
    label: "Inbox",
    header: {
      title: "Inbox",
      icon: "mark-mail",
      tabs: tabs(model, h),
      actions: waitingCount(model) === 0 ? [] : [button(h, "Mark all seen", Message.ClickedMarkAllSeen())]
    },
    body: [
      paneColumn(
        h,
        [
          isUnread(model) ? h.empty : notice(h, model.notice),
          notifications(model, now, h),
          ...(hasOlderItems(model)
            ? [
                buttonRow(h, [button(h, "Show older", Message.ClickedShowOlder(), { variant: "quiet" })], {
                  isCentered: true
                })
              ]
            : [])
        ],
        { isWide: true }
      )
    ]
  })
)

/**
 * The thread of the notification the person opened as the side pane, with the message the notification is about
 * highlighted in it, and the button that closes it, Close beside the title and Back before it on a phone, and
 * nothing while none is open.
 */
export const threadView = InboxComposition.makeView.withInputs<ViewInputs>((model, { now }, h) =>
  Option.match(model.selected, {
    onNone: () => h.empty,
    onSome: (selected) =>
      pane(h, {
        variant: "side",
        label: "Thread",
        header: {
          title: titleOf(selected.model),
          icon: "mark-reply",
          subtitle: threadSubtitle(findGroup(model, selected.groupId), model.members, model.memberId),
          leading: paneBack(h, Message.ClickedClose()),
          actions: [paneClose(h, Message.ClickedClose())]
        },
        body: [
          h.block(
            ThreadBinding.embedView({
              key: selected.threadId,
              slotId: "thread",
              model: selected.model,
              viewInputs: { now, highlightedMessageId: selected.messageId }
            })
          )
        ],
        footer: [
          h.block(
            ThreadBinding.embedView({
              key: selected.threadId,
              slotId: "thread-reply",
              model: selected.model,
              view: replyView
            })
          )
        ]
      })
  })
)
