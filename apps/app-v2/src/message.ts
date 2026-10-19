/** What happens at the root: the person signs out, what signing out reports back, and the window changes width. */

import { Viewport } from "@amends-dev/design/viewport"
import { defineMessageUnion } from "foldkit/message"

export const Message = defineMessageUnion({
  ClickedSignOut: {},
  CompletedSignOut: {},
  ChangedViewport: { viewport: Viewport }
})
export type Message = typeof Message.Type
