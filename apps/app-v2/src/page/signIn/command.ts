/** The sign-in requests, over HTTP, each ending in a message, failures worded for the person. */

import * as Accounts from "@amends-dev/gateway/Accounts"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Api from "../../api.ts"
import * as Session from "../../session.ts"
import { Message, SignInDefinition } from "./definition.ts"

const unreachable = "The host could not be reached. Try again."

/**
 * Send a sign-in code to `email`. The client reports a status the contract does not list as a defect, which a failure
 * handler misses, so any cause of the request ends in the reason worded for it and the form never stays waiting.
 */
export const SendCode = SignInDefinition.command("SendCode", {
  args: { email: Schema.String },
  messages: [Message.SucceededSendCode, Message.FailedSendCode],
  handler: function* () {
    const session = yield* Session.Session
    return ({ email }) =>
      Effect.gen(function* () {
        const address = yield* Schema.decodeEffect(Accounts.Email)(email).pipe(
          Effect.mapError(() => Message.FailedSendCode({ error: "Enter an email address." }))
        )
        const client = yield* Api.client(session.apiUrl)
        yield* client.session.start({ payload: { email: address } }).pipe(
          Effect.catchCause((cause) => {
            const error = Cause.squash(cause)

            return Effect.fail(
              Message.FailedSendCode({
                error: Schema.is(SignIn.Limited)(error)
                  ? "Too many codes were sent lately. Try again later."
                  : Schema.is(SignIn.Unavailable)(error)
                    ? "The code could not be sent. Try again."
                    : unreachable
              })
            )
          })
        )
        return Message.SucceededSendCode()
      }).pipe(Effect.catch(Effect.succeed))
  }
})

/**
 * Exchange the code sent to `email` for a session, kept for the next visit before it is reported. As with `SendCode`,
 * any cause of the request ends in a reason.
 */
export const CheckCode = SignInDefinition.command("CheckCode", {
  args: { email: Schema.String, code: Schema.String },
  messages: [Message.SucceededSignIn, Message.FailedSignIn],
  handler: function* () {
    const session = yield* Session.Session
    return ({ email, code }) =>
      Effect.gen(function* () {
        const payload = yield* Schema.decodeEffect(Schema.Struct({ email: Accounts.Email, code: SignIn.Code }))({
          email,
          code
        }).pipe(Effect.mapError(() => Message.FailedSignIn({ error: "Enter the six digits of the code." })))
        const client = yield* Api.client(session.apiUrl)
        const signed = yield* client.session.complete({ payload }).pipe(
          Effect.catchCause((cause) =>
            Effect.fail(
              Message.FailedSignIn({
                error: Schema.is(SignIn.Rejected)(Cause.squash(cause))
                  ? "That code is wrong or has expired."
                  : unreachable
              })
            )
          )
        )
        yield* session.keep(signed)
        return Message.SucceededSignIn({ session: signed })
      }).pipe(Effect.catch(Effect.succeed))
  }
})

export const EffectsLayer = Layer.mergeAll(SendCode.layer, CheckCode.layer)
