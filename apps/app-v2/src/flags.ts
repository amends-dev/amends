/**
 * What the app starts from: the host's address, from `VITE_AMENDS_API_URL` or this page's own `/api`,
 * and the session kept for it.
 */

import * as SignIn from "@amends-dev/gateway/SignIn"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Session from "./session.ts"

/** The host's address, as the page was built for, or where it is served from. */
export const apiUrl = (import.meta.env.VITE_AMENDS_API_URL as string | undefined) ?? `${window.location.origin}/api`

export const Flags = Schema.Struct({ session: Schema.Option(SignIn.Session) })
export type Flags = typeof Flags.Type

/** Read the flags as the page boots: the session kept from the last visit, if any. */
export const flags: Effect.Effect<Flags, never, Session.Session> = Effect.map(
  Effect.flatMap(Session.Session, (session) => session.current),
  (session) => Flags.make({ session })
)
