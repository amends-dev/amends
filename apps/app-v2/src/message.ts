/**
 * What happens at the root: the person signs out, what signing out reports back, the window changes width,
 * a minute passes, and the person presses the key that opens the search.
 */

import { Viewport } from "@amends-dev/design/viewport"
import * as Schema from "effect/Schema"
import { defineMessageUnion } from "foldkit/message"

export const Message = defineMessageUnion({
  ClickedSignOut: {},
  CompletedSignOut: {},
  ChangedViewport: { viewport: Viewport },
  Ticked: { now: Schema.DateTimeUtc },
  PressedSearchKey: {}
})
export type Message = typeof Message.Type
