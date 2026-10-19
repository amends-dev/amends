import { button, notice } from "@amends-dev/design/control"
import { message, messageList } from "@amends-dev/design/message"
import { pane, paneEmpty } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { timeOf } from "../../seen.ts"
import { InboxComposition, type InboxViewBuilder } from "./composition.ts"
import {
  type InboxItem,
  type Model,
  Message,
  notificationAuthor,
  notificationContext,
  notificationText,
  waitingNewestFirst
} from "./definition.ts"

/** A notification as a message of the person who wrote what it is about, whose text opens its thread, if it has one. */
const notificationRow = (item: InboxItem, model: Model, h: InboxViewBuilder): Html => {
  const { notification } = item
  const author = notificationAuthor(item, model)

  return message(h, {
    key: notification.id,
    mark: author.mark,
    author: author.name,
    time: timeOf(notification.recordedAt),
    context: Option.getOrUndefined(notificationContext(item, model)),
    text: notificationText(item),
    ...(notification.thread === undefined ? {} : { onOpen: Message.ClickedOpen({ notificationId: notification.id }) }),
    actions: [
      button(h, "Mark seen", Message.ClickedMarkSeen({ notificationId: notification.id }), { variant: "quiet" })
    ]
  })
}

/** The notifications still waiting for the person, newest first, to open, or to mark seen one or all at once. */
export const view = InboxComposition.makeView((model, h) => {
  const items = waitingNewestFirst(model)

  return pane(h, {
    variant: "main",
    label: "Inbox",
    header: {
      title: "Inbox",
      icon: "mark-mail",
      actions: items.length === 0 ? [] : [button(h, "Mark all seen", Message.ClickedMarkAllSeen())]
    },
    body: [
      notice(h, model.notice),
      items.length === 0
        ? paneEmpty(h, { icon: "mark-done", title: "You're all caught up", copy: "Nothing new." })
        : messageList(h, { label: "Notifications", children: items.map((item) => notificationRow(item, model, h)) })
    ]
  })
})
