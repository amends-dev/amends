/**
 * The app's side effects, each a named command that ends in a message: the sign-in requests,
 * keeping the session, listing the person's workspaces, and signing out. A command's failures are
 * messages too, worded for the person.
 */

import * as Accounts from "@amends-dev/gateway/Accounts"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Command from "foldkit/command"
import * as Api from "./api.ts"
import { Message } from "./message.ts"
import * as Session from "./session.ts"
import * as Store from "./sync/Store.ts"
import * as SyncKey from "./sync/SyncKey.ts"

const unreachable = "The host could not be reached. Try again."

/** Send a sign-in code to `email`. */
export const SendCode = Command.define("SendCode", {
  args: { apiUrl: Schema.String, email: Schema.String },
  messages: [Message.SucceededSendCode, Message.FailedSendCode],
  execute: ({ apiUrl, email }) =>
    Effect.gen(function* () {
      const address = yield* Schema.decodeEffect(Accounts.Email)(email).pipe(
        Effect.mapError(() => Message.FailedSendCode({ error: "Enter an email address." }))
      )
      const client = yield* Api.client(apiUrl)
      yield* client.session.start({ payload: { email: address } }).pipe(
        Effect.mapError((error) =>
          Message.FailedSendCode({
            error: Schema.is(SignIn.Limited)(error)
              ? "Too many codes were sent lately. Try again later."
              : Schema.is(SignIn.Unavailable)(error)
                ? "The code could not be sent. Try again."
                : unreachable
          })
        )
      )
      return Message.SucceededSendCode()
    }).pipe(Effect.catch(Effect.succeed))
})

/** Exchange the code sent to `email` for a session. */
export const CheckCode = Command.define("CheckCode", {
  args: { apiUrl: Schema.String, email: Schema.String, code: Schema.String },
  messages: [Message.SucceededSignIn, Message.FailedSignIn],
  execute: ({ apiUrl, email, code }) =>
    Effect.gen(function* () {
      const payload = yield* Schema.decodeEffect(Schema.Struct({ email: Accounts.Email, code: SignIn.Code }))({
        email,
        code
      }).pipe(Effect.mapError(() => Message.FailedSignIn({ error: "Enter the six digits of the code." })))
      const client = yield* Api.client(apiUrl)
      const session = yield* client.session.complete({ payload }).pipe(
        Effect.mapError((error) =>
          Message.FailedSignIn({
            error: Schema.is(SignIn.Rejected)(error) ? "That code is wrong or has expired." : unreachable
          })
        )
      )
      return Message.SucceededSignIn({ session })
    }).pipe(Effect.catch(Effect.succeed))
})

/** Keep `session` in the browser for the next visit. */
export const SaveSession = Command.define("SaveSession", {
  args: { apiUrl: Schema.String, session: SignIn.Session },
  messages: [Message.CompletedSaveSession],
  execute: ({ apiUrl, session }) =>
    Session.save(apiUrl, session).pipe(
      Effect.tapCause((cause) => Effect.logWarning("The session could not be kept", cause)),
      Effect.ignore,
      Effect.as(Message.CompletedSaveSession())
    )
})

/** List the workspaces the session's person belongs to. */
export const LoadWorkspaces = Command.define("LoadWorkspaces", {
  args: { apiUrl: Schema.String, token: Schema.String },
  messages: [Message.SucceededLoadWorkspaces, Message.FailedLoadWorkspaces],
  execute: ({ apiUrl, token }) =>
    Effect.gen(function* () {
      const client = yield* Api.client(apiUrl, token)
      const listing = yield* client.me.workspaces()
      return Message.SucceededLoadWorkspaces({ memberships: listing.memberships })
    }).pipe(Effect.orElseSucceed(() => Message.FailedLoadWorkspaces({ error: unreachable })))
})

/**
 * Sign out: forget the session, the person's stores, and the identity they synced with, then, as
 * far as the host can be reached, remove the browser's sync key and end the session there too.
 */
export const SignOut = Command.define("SignOut", {
  args: { apiUrl: Schema.String, session: SignIn.Session },
  messages: [Message.CompletedSignOut],
  execute: ({ apiUrl, session }) =>
    Effect.gen(function* () {
      const humanId = session.account.id
      const identity = yield* SyncKey.find(apiUrl, humanId)
      yield* Session.forget(apiUrl)
      yield* Store.forgetPerson(apiUrl, humanId)
      const client = yield* Api.client(apiUrl, session.token)
      if (Option.isSome(identity))
        yield* Effect.ignore(client.me.removeSyncKey({ params: { publicKey: identity.value.publicKey } }))
      yield* Effect.ignore(client.me.signOut())
    }).pipe(
      Effect.tapCause((cause) => Effect.logWarning("Signing out left something behind", cause)),
      Effect.ignore,
      Effect.as(Message.CompletedSignOut())
    )
})
