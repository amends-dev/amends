import { button, notice } from "@amends-dev/design/control"
import { divider, messageList, notification } from "@amends-dev/design/message"
import { pane, paneEmpty, paneTabs } from "@amends-dev/design/pane"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { ageLabel } from "../../seen.ts"
import { InboxComposition, type InboxViewBuilder } from "./composition.ts"
import {
  byDay,
  type InboxItem,
  isWaiting,
  Message,
  type Model,
  notificationHeadline,
  notificationPlace,
  notificationText,
  shownNewestFirst,
  type Tab,
  waitingCount
} from "./definition.ts"

/** The time now, which the days the notifications came on and how long ago they came are read from. */
export type ViewInputs = Readonly<{ now: DateTime.Utc }>

/** What the body says when a tab has nothing to list. */
const nothingToList = {
  All: { icon: "mark-mail", title: "Nothing here yet", copy: "Notifications about your threads arrive here." },
  Unread: { icon: "mark-done", title: "You're all caught up", copy: "Nothing new." }
} as const satisfies Record<Tab, Parameters<typeof paneEmpty>[1]>

/** The tabs under the title: every notification, and those waiting, counted. */
const tabs = (model: Model, h: InboxViewBuilder): Html =>
  paneTabs(h, {
    label: "Inbox",
    tabs: [
      { label: "All", isCurrent: model.tab === "All", onClick: Message.ChoseTab({ tab: "All" }) },
      {
        label: "Unread",
        count: waitingCount(model),
        isCurrent: model.tab === "Unread",
        onClick: Message.ChoseTab({ tab: "Unread" })
      }
    ]
  })

/**
 * A notification as the design's row: the author of what its activity is about and what they did, where it
 * comes from, and what it says, which opens its thread, if it has one, how long ago it came, and, while it
 * waits, unread, with the way to mark it seen.
 */
const notificationRow = (item: InboxItem, model: Model, now: DateTime.Utc, h: InboxViewBuilder): Html => {
  const { id, recordedAt, thread } = item.notification
  const isUnread = isWaiting(item)

  return notification(h, {
    key: id,
    ...notificationHeadline(item, model),
    place: Option.getOrUndefined(notificationPlace(item, model)),
    text: notificationText(item),
    age: ageLabel(recordedAt, now),
    isUnread,
    ...(thread === undefined ? {} : { onOpen: Message.ClickedOpen({ notificationId: id }) }),
    actions: isUnread
      ? [button(h, "Mark seen", Message.ClickedMarkSeen({ notificationId: id }), { variant: "quiet" })]
      : []
  })
}

/** The notifications the tab shows, newest first, under the days they came, to open or to mark seen. */
export const view = InboxComposition.makeView.withInputs<ViewInputs>((model, { now }, h) => {
  const items = shownNewestFirst(model)

  return pane(h, {
    variant: "main",
    label: "Inbox",
    header: {
      title: "Inbox",
      icon: "mark-mail",
      tabs: tabs(model, h),
      actions: waitingCount(model) === 0 ? [] : [button(h, "Mark all seen", Message.ClickedMarkAllSeen())]
    },
    body: [
      notice(h, model.notice),
      items.length === 0
        ? paneEmpty(h, nothingToList[model.tab])
        : messageList(h, {
            label: "Notifications",
            children: byDay(items, now).flatMap((day) => [
              divider(h, day.label),
              ...day.items.map((item) => notificationRow(item, model, now, h))
            ])
          })
    ]
  })
})
