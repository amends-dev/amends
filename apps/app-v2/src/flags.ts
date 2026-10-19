/**
 * What the app starts from: the host's address, from `VITE_AMENDS_API_URL` or this page's own `/api`,
 * the session kept for it, the width of the window, and the time now.
 */

import { Viewport, viewportOf, viewportQueries } from "@amends-dev/design/viewport"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Session from "./session.ts"

/** The host's address, as the page was built for, or where it is served from. */
export const apiUrl = (import.meta.env.VITE_AMENDS_API_URL as string | undefined) ?? `${window.location.origin}/api`

export const Flags = Schema.Struct({
  session: Schema.Option(SignIn.Session),
  viewport: Viewport,
  now: Schema.DateTimeUtc
})
export type Flags = typeof Flags.Type

/**
 * The window's width now. The first render needs it: the runtime processes no Message until it has painted, so
 * a subscription alone would paint the desktop layout on a phone before correcting it.
 */
const readViewport = Effect.sync(() =>
  viewportOf({
    isTablet: window.matchMedia(viewportQueries.tablet).matches,
    isDesktop: window.matchMedia(viewportQueries.desktop).matches,
    isSplit: window.matchMedia(viewportQueries.split).matches
  })
)

/**
 * Read the flags as the page boots: the session kept from the last visit, if any, the window's width, and the
 * time now, which the first render needs for the ages and days it shows.
 */
export const flags: Effect.Effect<Flags, never, Session.Session> = Effect.map(
  Effect.all({
    session: Effect.flatMap(Session.Session, (session) => session.current),
    viewport: readViewport,
    now: DateTime.now
  }),
  (read) => Flags.make(read)
)
