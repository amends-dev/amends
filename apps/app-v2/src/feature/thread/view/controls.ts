/** The thread’s follow control and reply composer. */

import { iconButton } from "@amends-dev/design/control"
import * as Option from "effect/Option"
import { view as composerView } from "../../composer/view.ts"
import { ThreadBlock } from "../block.ts"
import { ReplyBinding } from "../composition.ts"
import { Message } from "../definition.ts"

/**
 * The person's part in the thread as a bell in the pane's header, as `apps/ui` has it: named Follow thread, or
 * Following thread, filled and pressed, while they follow it, which stops following, and unavailable while a change to
 * that is on its way.
 */
export const followView = ThreadBlock.makeView((model, h) => {
  const isFollowing = Option.exists(model.following, ({ active }) => active)
  const isPending = Option.exists(model.following, ({ pending }) => pending)

  return isFollowing
    ? iconButton(
        h,
        { icon: "bell-filled", label: "Following thread", onClick: Message.ClickedUnfollow() },
        { isPressed: true, isDisabled: isPending }
      )
    : iconButton(
        h,
        { icon: "bell", label: "Follow thread", onClick: Message.ClickedFollow() },
        { isPressed: false, isDisabled: isPending }
      )
})

/** The composer to reply in the thread, for a pane's footer. */
export const replyView = ThreadBlock.makeView((model, h) =>
  h.block(
    ReplyBinding.embedView({
      slotId: "reply",
      model: model.reply,
      view: composerView,
      viewInputs: { placeholder: "Reply in thread", members: model.members }
    })
  )
)
