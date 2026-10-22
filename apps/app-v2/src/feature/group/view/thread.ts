/** The thread open beside the group, or its turn log. */

import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import { sideSubtitle } from "../../../view/groups.ts"
import { hasTurnLog } from "../../thread/definition.ts"
import { view as threadBodyView } from "../../thread/view/body.ts"
import { followView, replyView } from "../../thread/view/controls.ts"
import { sidePane } from "../../thread/view/pane.ts"
import { turnLogView } from "../../thread/view/turnLog.ts"
import { aboutOf } from "../../thread/view/wording.ts"
import { GroupBlock } from "../block.ts"
import { ThreadBinding } from "../composition.ts"
import { Message } from "../definition.ts"
import { nameOf } from "./identity.ts"

/**
 * The time now, which the days the thread's messages were published on are read from, and the trigger whose member's
 * card is open.
 */
export type ThreadViewInputs = Readonly<{ now: DateTime.Utc; openTriggerId: string | undefined }>

/**
 * The thread open in the group as the side pane (see `sidePane`), a task's when the thread tracks one, with the button
 * that closes it, Close beside the title and Back before it on a phone, which goes back to the Tasks tab when the
 * tasks are what the group lists, and to the group otherwise; or, while the person follows the log of one of its
 * turns, that log in its place, where it is. Nothing while no thread is open.
 */
export const threadView = GroupBlock.makeView.withInputs<ThreadViewInputs>((model, { now, openTriggerId }, h) =>
  Option.match(model.thread, {
    onNone: () => h.empty,
    onSome: ({ threadId, model: open }) => {
      const group = Option.map(model.group, ({ group }) => group)

      return hasTurnLog(open)
        ? h.block(
            ThreadBinding.embedView({
              key: threadId,
              slotId: "turn-log",
              model: open,
              view: turnLogView,
              viewInputs: { where: sideSubtitle(aboutOf(open), group, model.members, model.memberId) }
            })
          )
        : sidePane(h, {
            thread: open,
            group,
            members: model.members,
            self: model.memberId,
            backTo: model.threads.tab === "Tasks" ? "Tasks" : nameOf(model),
            onClose: Message.ClickedAllThreads(),
            follow: h.block(
              ThreadBinding.embedView({ key: threadId, slotId: "thread-follow", model: open, view: followView })
            ),
            body: h.block(
              ThreadBinding.embedView({
                key: threadId,
                slotId: "thread",
                model: open,
                viewInputs: { now, openTriggerId },
                view: threadBodyView
              })
            ),
            reply: h.block(
              ThreadBinding.embedView({ key: threadId, slotId: "thread-reply", model: open, view: replyView })
            )
          })
    }
  })
)
