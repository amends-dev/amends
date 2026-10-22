/** The open thread beside Home’s main destination. */

import type * as DateTime from "effect/DateTime"
import { threadView as groupThreadView } from "../../../../feature/group/view/thread.ts"
import { threadView as inboxThreadView } from "../../../../feature/inbox/view/thread.ts"
import { openTriggerIdOf } from "../../../../feature/profileCard/definition.ts"
import { GroupBinding, HomeComposition, InboxBinding } from "../composition.ts"
import { Open } from "../definition.ts"

/** The time now, which the thread in the side pane is read by. */
export type ThreadInputs = Readonly<{ now: DateTime.Utc }>

/**
 * The side pane: the thread open, in the group open or beside the inbox, while there is one, given the time now and the
 * trigger whose member's card is open.
 */
export const threadView = HomeComposition.makeView.withInputs<ThreadInputs>((model, { now }, h) => {
  const openTriggerId = openTriggerIdOf(model.profileCard)

  return Open.matchOrElse(
    model.open,
    {
      Inbox: () =>
        h.block(
          InboxBinding.embedView({
            slotId: "inbox-thread",
            model: model.inbox,
            viewInputs: { now, openTriggerId },
            view: inboxThreadView
          })
        ),
      Group: ({ groupId, model: open }) =>
        h.block(
          GroupBinding.embedView({
            key: groupId,
            slotId: "group-thread",
            model: open,
            view: groupThreadView,
            viewInputs: { now, openTriggerId }
          })
        )
    },
    () => h.empty
  )
})
