/**
 * The session the app keeps between visits: the host's address, and the token and account a sign-in
 * gave, kept in the browser's storage for that host until the person signs out. Commands and stores
 * read it here; no model carries the token.
 */

import * as SignIn from "@amends-dev/gateway/SignIn"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"

/** No one is signed in, where someone signed in was expected. */
export class NotSignedIn extends Schema.TaggedError<NotSignedIn>("@amends-dev/app-v2/NotSignedIn")("NotSignedIn", {}) {}

const storageKey = (apiUrl: string) => `amends/${apiUrl}/session`
const SessionJson = Schema.fromJsonString(Schema.toCodecJson(SignIn.Session))

/** The session of the person using the app, on the host the app was built for. */
export class Session extends Context.Service<
  Session,
  {
    /** The host's address. */
    readonly apiUrl: string
    /** The session, while someone is signed in. */
    readonly current: Effect.Effect<Option.Option<SignIn.Session>>
    /** The session, or `NotSignedIn`. */
    readonly required: Effect.Effect<SignIn.Session, NotSignedIn>
    /** Keep `session` for the next visit. */
    readonly keep: (session: SignIn.Session) => Effect.Effect<void>
    /** Forget the session, as signing out does. */
    readonly forget: Effect.Effect<void>
  }
>()("@amends-dev/app-v2/session") {}

/**
 * The session kept for the host at `apiUrl`, read from the browser's storage as the app starts; one
 * that no longer decodes is none.
 *
 * @category layers
 */
export const layer = (apiUrl: string): Layer.Layer<Session, never, KeyValueStore.KeyValueStore> =>
  Layer.effect(
    Session,
    Effect.gen(function* () {
      const store = yield* KeyValueStore.KeyValueStore
      const key = storageKey(apiUrl)
      const kept = yield* Effect.flatMap(store.get(key), (text) =>
        text === undefined ? Effect.succeedNone : Effect.option(Schema.decodeEffect(SessionJson)(text))
      ).pipe(Effect.orElseSucceed(() => Option.none<SignIn.Session>()))
      const ref = yield* Ref.make(kept)
      const current = Ref.get(ref)
      return Session.of({
        apiUrl,
        current,
        required: Effect.flatMap(
          current,
          Option.match({ onNone: () => Effect.fail(new NotSignedIn()), onSome: Effect.succeed })
        ),
        keep: (session) =>
          Effect.andThen(
            Ref.set(ref, Option.some(session)),
            Effect.flatMap(Schema.encodeEffect(SessionJson)(session), (text) => store.set(key, text)).pipe(
              Effect.tapCause((cause) => Effect.logWarning("The session could not be kept", cause)),
              Effect.ignore
            )
          ),
        forget: Effect.andThen(Ref.set(ref, Option.none()), Effect.ignore(store.remove(key)))
      })
    })
  )
