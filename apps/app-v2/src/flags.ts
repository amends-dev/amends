/**
 * What the app starts from: the host's address, from `VITE_AMENDS_API_URL` or this page's own `/api`,
 * and the session kept for it.
 */

import * as SignIn from "@amends-dev/gateway/SignIn"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Session from "./session.ts"

export const Flags = Schema.Struct({
  apiUrl: Schema.String,
  session: Schema.Option(SignIn.Session)
})
export type Flags = typeof Flags.Type

/** The host's address, as the page was built for, or where it is served from. */
const apiUrl = (import.meta.env.VITE_AMENDS_API_URL as string | undefined) ?? `${window.location.origin}/api`

/** Read the flags as the page boots; a session that cannot be read is none. */
export const flags: Effect.Effect<Flags> = Session.load(apiUrl).pipe(
  Effect.orElseSucceed(() => Option.none<SignIn.Session>()),
  Effect.map((session) => Flags.make({ apiUrl, session })),
  Effect.provide(BrowserKeyValueStore.layerLocalStorage)
)
