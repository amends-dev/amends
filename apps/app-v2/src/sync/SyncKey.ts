/**
 * The eventlog identity a browser syncs one person's stores with on one host, whose public key is
 * the sync key the person registers: made the first time they open a store there, and kept in the
 * browser's storage until they sign out of it.
 */

import type { Identity } from "@amends-dev/core/identity"
import * as Effect from "effect/Effect"
import * as EventLog from "effect/eventlog/EventLog"
import * as Option from "effect/Option"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

const storageKey = (apiUrl: string, humanId: Identity.HumanId) => `amends/${apiUrl}/${humanId}/sync-identity`

/** The identity `humanId` syncs with on the host at `apiUrl`, if this browser made one. */
export const find = Effect.fnUntraced(function* (apiUrl: string, humanId: Identity.HumanId) {
  const kept = yield* (yield* KeyValueStore.KeyValueStore).get(storageKey(apiUrl, humanId))
  // One that no longer decodes is as good as none: a new one replaces it.
  return Option.flatMap(Option.fromUndefinedOr(kept), (text) =>
    Option.liftThrowable(EventLog.decodeIdentityString)(text)
  )
})

/** The identity `humanId` syncs with on the host at `apiUrl`, made and kept the first time. */
export const forPerson = Effect.fnUntraced(function* (apiUrl: string, humanId: Identity.HumanId) {
  const kept = yield* find(apiUrl, humanId)
  if (Option.isSome(kept)) return kept.value
  const made = yield* EventLog.makeIdentity
  yield* (yield* KeyValueStore.KeyValueStore).set(storageKey(apiUrl, humanId), EventLog.encodeIdentityString(made))
  return made
})

/** Forget the identity `humanId` syncs with on the host at `apiUrl`, as signing out does. */
export const forget = Effect.fnUntraced(function* (apiUrl: string, humanId: Identity.HumanId) {
  yield* (yield* KeyValueStore.KeyValueStore).remove(storageKey(apiUrl, humanId))
})
