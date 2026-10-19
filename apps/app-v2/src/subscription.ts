/**
 * The root's subscription: the window's width, which the views that depend on it follow. The flags give
 * the width at startup; this keeps it current as the window is resized or turned.
 */

import { viewportOf, viewportQueries } from "@amends-dev/design/viewport"
import * as Stream from "effect/Stream"
import * as Dom from "foldkit/dom"
import { ApplicationDefinition } from "./definition.ts"
import { Message } from "./message.ts"

const watchQuery = (query: string) => Dom.streamFromMediaQuery({ query, mapMatches: (isMatching) => isMatching })

export const subscriptions = ApplicationDefinition.subscriptions((entry) => ({
  viewport: entry("WatchViewport", {
    messages: [Message.ChangedViewport],
    handler: function* () {
      return () =>
        Stream.zipLatestAll(
          watchQuery(viewportQueries.tablet),
          watchQuery(viewportQueries.desktop),
          watchQuery(viewportQueries.split)
        ).pipe(
          Stream.map(([isTablet, isDesktop, isSplit]) => viewportOf({ isTablet, isDesktop, isSplit })),
          Stream.changes,
          Stream.map((viewport) => Message.ChangedViewport({ viewport }))
        )
    }
  })
}))
