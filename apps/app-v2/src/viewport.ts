/** The window's width as the theme's breakpoints cut it, as it changes: what the root and a composer both follow. */

import { type Viewport, viewportOf, viewportQueries } from "@amends-dev/design/viewport"
import * as Stream from "effect/Stream"
import * as Dom from "foldkit/dom"

const watchQuery = (query: string) => Dom.streamFromMediaQuery({ query, mapMatches: (isMatching) => isMatching })

/** The viewport the window is in now and each one it moves to as it is resized or turned. */
export const viewportChanges: Stream.Stream<Viewport> = Stream.zipLatestAll(
  watchQuery(viewportQueries.tablet),
  watchQuery(viewportQueries.desktop),
  watchQuery(viewportQueries.split)
).pipe(
  Stream.map(([isTablet, isDesktop, isSplit]) => viewportOf({ isTablet, isDesktop, isSplit })),
  Stream.changes
)
