/** The window's width, which decides whether the toolbar of formatting starts shown, as the root follows it. */

import * as Stream from "effect/Stream"
import { viewportChanges } from "../../viewport.ts"
import { ComposerDefinition, Message } from "./definition.ts"

export const subscriptions = ComposerDefinition.makeSubscriptions((entry) => ({
  viewport: entry("WatchViewport", {
    messages: [Message.ChangedViewport],
    handler: function* () {
      return () => Stream.map(viewportChanges, (viewport) => Message.ChangedViewport({ viewport }))
    }
  })
}))
