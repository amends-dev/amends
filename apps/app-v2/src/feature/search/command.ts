/** Keeping the item the person reaches in view. */

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Dom from "foldkit/dom"
import { Message, SearchDefinition } from "./definition.ts"

/** Scroll the item `id` into view in the list, so that the one the arrow keys reach is seen. */
export const ScrollToItem = SearchDefinition.makeCommand("ScrollToItem", {
  args: { id: Schema.String },
  messages: [Message.CompletedScrollToItem],
  handler: function* () {
    return ({ id }) =>
      Dom.scrollIntoView(`#${CSS.escape(id)}`).pipe(Effect.ignore, Effect.as(Message.CompletedScrollToItem()))
  }
})

export const EffectsLayer = ScrollToItem.layer
