/**
 * The root's side effects: signing out, which forgets the session, the person's stores, and the
 * identity they synced with, so it works offline, then, as far as the host can be reached, removes
 * the browser's sync key and ends the session there too; and showing the person's Appearance on the
 * page and keeping it for the next visit.
 */

import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Navigation from "foldkit/navigation"
import * as Api from "./api.ts"
import { Appearance, keepAppearance, showAppearance } from "./appearance.ts"
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

/** Show the Appearance on the page. */
export const ShowAppearance = ApplicationDefinition.command("ShowAppearance", {
  args: { appearance: Appearance },
  messages: [Message.CompletedShowAppearance],
  handler: function* () {
    return ({ appearance }) => Effect.as(showAppearance(appearance), Message.CompletedShowAppearance())
  }
})

/** Keep the Appearance for the next visit. */
export const KeepAppearance = ApplicationDefinition.command("KeepAppearance", {
  args: { appearance: Appearance },
  messages: [Message.CompletedKeepAppearance],
  handler: function* () {
    return ({ appearance }) => Effect.as(keepAppearance(appearance), Message.CompletedKeepAppearance())
  }
})

export const Navigate = ApplicationDefinition.command("Navigate", {
  args: { url: Schema.String, replace: Schema.Boolean },
  messages: [Message.CompletedNavigation],
  handler: function* () {
    return ({ url, replace }) =>
      Effect.gen(function* () {
        const targetUrl = new URL(url, window.location.href)
        if (targetUrl.href !== window.location.href) {
          if (replace) yield* Navigation.replaceUrl(url)
          else yield* Navigation.pushUrl(url)
        }
        yield* Effect.sync(() => {
          const hash = new URL(url, window.location.href).hash
          if (hash === "") return
          try {
            const target = document.getElementById(decodeURIComponent(hash.slice(1)))
            target?.focus()
            target?.scrollIntoView()
          } catch {
            /* A malformed fragment has no target. */
          }
        })
        return Message.CompletedNavigation()
      })
  }
})

export const LoadExternal = ApplicationDefinition.command("LoadExternal", {
  args: { href: Schema.String },
  messages: [Message.CompletedNavigation],
  handler: function* () {
    return ({ href }) => Navigation.load(href).pipe(Effect.as(Message.CompletedNavigation()))
  }
})

export const EffectsLayer = Layer.mergeAll(
  SignOut.layer,
  ShowAppearance.layer,
  KeepAppearance.layer,
  Navigate.layer,
  LoadExternal.layer
)
