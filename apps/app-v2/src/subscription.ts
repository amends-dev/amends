/**
 * The root's subscriptions: the window's width, which the views that depend on it follow, and the time, which
 * the views that show ages and days follow. The flags give both at startup; these keep them current as the
 * window is resized or turned and as the minutes pass. And the key that opens the search, wherever in the
 * workspace the person is.
 */

import { viewportOf, viewportQueries } from "@amends-dev/design/viewport"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Dom from "foldkit/dom"
import { ApplicationDefinition } from "./definition.ts"
import { Message } from "./message.ts"
import { openedWorkspaceId } from "./model.ts"

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
  }),
  // Control+K, or Command+K on an Apple platform, opens the search of the open workspace, also from a field, and
  // is left to the browser while there is none.
  openSearch: entry(
    "OpenSearch",
    { isWorkspaceOpen: Schema.Boolean },
    {
      messages: [Message.PressedSearchKey],
      modelToDependencies: (model) => ({ isWorkspaceOpen: Option.isSome(openedWorkspaceId(model)) }),
      handler: function* () {
        return ({ isWorkspaceOpen }) =>
          Dom.streamFromKeyBindings({
            bindings: [
              {
                keys: "Mod+K",
                isEnabled: isWorkspaceOpen,
                whileTyping: "Allow",
                mapEvent: () => Message.PressedSearchKey()
              }
            ]
          })
      }
    }
  )
}))
