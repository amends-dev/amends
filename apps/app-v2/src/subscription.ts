/**
 * The root's subscriptions: the window's width, which the views that depend on it follow, and the time, which
 * the views that show ages and days follow. The flags give both at startup; these keep them current as the
 * window is resized or turned and as the minutes pass.
 */

import { viewportOf, viewportQueries } from "@amends-dev/design/viewport"
import * as DateTime from "effect/DateTime"
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
  }),
  tick: entry("Tick", {
    messages: [Message.Ticked],
    handler: function* () {
      return () =>
        Stream.tick("1 minute").pipe(
          Stream.mapEffect(() => DateTime.now),
          Stream.map((now) => Message.Ticked({ now }))
        )
    }
  })
}))
