/** The thread opened from a notification, with its highlighted message. */

import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import { reasonSubtitle, sideSubtitle } from "../../../view/groups.ts"
import { hasTurnLog } from "../../thread/definition.ts"
import { view as threadBodyView } from "../../thread/view/body.ts"
import { followView, replyView } from "../../thread/view/controls.ts"
import { sidePane } from "../../thread/view/pane.ts"
import { turnLogView } from "../../thread/view/turnLog.ts"
import { aboutOf } from "../../thread/view/wording.ts"
import { InboxBlock } from "../block.ts"
import { ThreadBinding } from "../composition.ts"
import { findGroup, Message } from "../definition.ts"
import { selectedReasonWords } from "./notification.ts"

/**
 * The time now, which the days the thread's messages were published on are read from, and the trigger whose member's
 * card is open.
 */
export type ThreadViewInputs = Readonly<{ now: DateTime.Utc; openTriggerId: string | undefined }>

/**
 * The thread of the notification the person opened as the side pane (see `sidePane`), a task's when it tracks one, with
 * the message the notification is about highlighted in it, the reason the notification came as its subtitle, such as
 * "Mention · #general", while the store holds the message, and the button that closes it, Close beside the title and
 * Back, named for the Inbox, before it on a phone; or, while the person follows the log of one of its turns, that log
 * in its place, beside the inbox; and nothing while no thread is open.
 */
export const threadView = InboxBlock.makeView.withInputs<ThreadViewInputs>((model, { now, openTriggerId }, h) =>
  Option.match(model.selected, {
    onNone: () => h.empty,
    onSome: (selected) => {
      const group = findGroup(model, selected.groupId)

      if (hasTurnLog(selected.model)) {
        return h.block(
          ThreadBinding.embedView({
            key: selected.threadId,
            slotId: "turn-log",
            model: selected.model,
            view: turnLogView,
            viewInputs: { where: sideSubtitle(aboutOf(selected.model), group, model.members, model.memberId) }
          })
        )
      }

      return sidePane(h, {
        thread: selected.model,
        group,
        members: model.members,
        self: model.memberId,
        backTo: "Inbox",
        subtitle: Option.getOrUndefined(
          Option.map(selectedReasonWords(model), (reason) =>
            reasonSubtitle(reason, group, model.members, model.memberId)
          )
        ),
        onClose: Message.ClickedClose(),
        follow: h.block(
          ThreadBinding.embedView({
            key: selected.threadId,
            slotId: "thread-follow",
            model: selected.model,
            view: followView
          })
        ),
        body: h.block(
          ThreadBinding.embedView({
            key: selected.threadId,
            slotId: "thread",
            model: selected.model,
            viewInputs: { now, openTriggerId, highlightedMessageId: selected.messageId },
            view: threadBodyView
          })
        ),
        reply: h.block(
          ThreadBinding.embedView({
            key: selected.threadId,
            slotId: "thread-reply",
            model: selected.model,
            view: replyView
          })
        )
      })
    }
  })
)
