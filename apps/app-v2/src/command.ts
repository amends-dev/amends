/**
 * The root's side effect: signing out, which forgets the session, the person's stores, and the
 * identity they synced with, so it works offline, then, as far as the host can be reached, removes
 * the browser's sync key and ends the session there too.
 */

import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Api from "./api.ts"
import { ApplicationDefinition } from "./definition.ts"
import { Message } from "./message.ts"
import * as Session from "./session.ts"
import * as Store from "./store/Store.ts"
import * as SyncKey from "./store/SyncKey.ts"

/** Sign out. */
export const SignOut = ApplicationDefinition.command("SignOut", {
  messages: [Message.CompletedSignOut],
  handler: function* () {
    const session = yield* Session.Session
    return () =>
      Effect.gen(function* () {
        const signed = yield* session.current
        yield* session.forget
        if (Option.isNone(signed)) return Message.CompletedSignOut()
        const humanId = signed.value.account.id
        const identity = yield* SyncKey.find(session.apiUrl, humanId)
        yield* Store.forgetPerson(session.apiUrl, humanId)
        const client = yield* Api.client(session.apiUrl, signed.value.token)
        if (Option.isSome(identity))
          yield* Effect.ignore(client.me.removeSyncKey({ params: { publicKey: identity.value.publicKey } }))
        yield* Effect.ignore(client.me.signOut())
        return Message.CompletedSignOut()
      }).pipe(
        Effect.tapCause((cause) => Effect.logWarning("Signing out left something behind", cause)),
        Effect.orElseSucceed(() => Message.CompletedSignOut())
      )
  }
})

export const EffectsLayer = SignOut.layer
