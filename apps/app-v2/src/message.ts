/** What happens at the root: the person signs out, and what signing out reports back. */

import { defineMessageUnion } from "foldkit/message"

export const Message = defineMessageUnion({
  ClickedSignOut: {},
  CompletedSignOut: {}
})
export type Message = typeof Message.Type
