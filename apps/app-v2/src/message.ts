/**
 * What happens at the root: the person signs out, what signing out reports back, the window changes width,
 * and a minute passes.
 */

import { Viewport } from "@amends-dev/design/viewport"
import * as Schema from "effect/Schema"
import { defineMessageUnion } from "foldkit/message"

export const Message = defineMessageUnion({
  ClickedSignOut: {},
  CompletedSignOut: {},
  ChangedViewport: { viewport: Viewport },
  Ticked: { now: Schema.DateTimeUtc }
})
export type Message = typeof Message.Type
