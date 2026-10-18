/**
 * The session the app keeps between visits: the host's address, and the token and account a sign-in
 * gave, kept in the browser's storage for that host until the person signs out.
 */

import * as SignIn from "@amends-dev/gateway/SignIn"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Schema from "effect/Schema"

const storageKey = (apiUrl: string) => `amends/${apiUrl}/session`
const SessionJson = Schema.fromJsonString(Schema.toCodecJson(SignIn.Session))

/** The session kept for the host at `apiUrl`, if any; one that no longer decodes is none. */
export const load = Effect.fnUntraced(function* (apiUrl: string) {
  const kept = yield* (yield* KeyValueStore.KeyValueStore).get(storageKey(apiUrl))
  if (kept === undefined) return Option.none<SignIn.Session>()
  return yield* Effect.option(Schema.decodeEffect(SessionJson)(kept))
})

/** Keep `session` for the host at `apiUrl`. */
export const save = Effect.fnUntraced(function* (apiUrl: string, session: SignIn.Session) {
  yield* (yield* KeyValueStore.KeyValueStore).set(storageKey(apiUrl), yield* Schema.encodeEffect(SessionJson)(session))
})

/** Forget the session kept for the host at `apiUrl`. */
export const forget = Effect.fnUntraced(function* (apiUrl: string) {
  yield* (yield* KeyValueStore.KeyValueStore).remove(storageKey(apiUrl))
})
