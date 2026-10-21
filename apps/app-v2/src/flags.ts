/**
 * What the app starts from: the host's address, from `VITE_AMENDS_API_URL` or this page's own `/api`,
 * the session kept for it, the Appearance kept from the last visit, the width of the window, the time now, and
 * whether the page runs on an Apple platform.
 */

import { Viewport, viewportOf, viewportQueries } from "@amends-dev/design/viewport"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import type * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { Appearance, readKeptAppearance } from "./appearance.ts"
import * as Session from "./session.ts"

/** The host's address, as the page was built for, or where it is served from. */
export const apiUrl = (import.meta.env.VITE_AMENDS_API_URL as string | undefined) ?? `${window.location.origin}/api`

export const Flags = Schema.Struct({
  session: Schema.Option(SignIn.Session),
  appearance: Appearance,
  viewport: Viewport,
  now: Schema.DateTimeUtc,
  isApplePlatform: Schema.Boolean
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

/** Whether `platform`, a browser's name for the system it runs on, is one of Apple's: macOS, iOS, or iPadOS. */
export const namesApplePlatform = (platform: string): boolean => /mac|iphone|ipad|ipod/i.test(platform)

/**
 * The name of the system the page runs on: the user agent's own, `userAgentData.platform`, in the browsers that
 * have one, otherwise `navigator.platform`, which the others give and which is deprecated but not removed.
 */
const platformName = (): string =>
  Predicate.hasProperty(navigator, "userAgentData") &&
  Predicate.hasProperty(navigator.userAgentData, "platform") &&
  Predicate.isString(navigator.userAgentData.platform)
    ? navigator.userAgentData.platform
    : navigator.platform

/**
 * Whether the page runs on an Apple platform, where a shortcut is made with Command and not Control, which the
 * search's label in the sidebar says.
 */
const readIsApplePlatform = Effect.sync(() => namesApplePlatform(platformName()))

/**
 * Read the flags as the page boots: the session kept from the last visit, if any, and the Appearance kept with it,
 * the window's width, the time now, which the first render needs for the ages and days it shows, and whether the page
 * runs on an Apple platform.
 */
export const flags: Effect.Effect<Flags, never, Session.Session | KeyValueStore.KeyValueStore> = Effect.map(
  Effect.all({
    session: Effect.flatMap(Session.Session, (session) => session.current),
    appearance: readKeptAppearance,
    viewport: readViewport,
    now: DateTime.now,
    isApplePlatform: readIsApplePlatform
  }),
  (read) => Flags.make(read)
)
