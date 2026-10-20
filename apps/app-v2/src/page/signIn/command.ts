/**
 * The sign-in requests, over HTTP, each ending in a message, failures told as the reason the person is shown. And
 * moving focus back to the code.
 */

import * as Accounts from "@amends-dev/gateway/Accounts"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Dom from "foldkit/dom"
import * as Api from "../../api.ts"
import * as Session from "../../session.ts"
import { type CodeError, type EmailError, Message, SignInDefinition } from "./definition.ts"

/** The ID of the code's input, which a label finds and focus moves to. */
export const codeFieldId = "code"

/** Why the host did not send a code: too many were requested lately, or, whatever else happened, it could not. */
const emailErrorOf = (error: unknown): EmailError =>
  Schema.is(SignIn.Limited)(error) ? "RateLimited" : "RequestFailed"

/** What the host says of a code it rejected, as the person is told it. */
const rejections: Readonly<Record<SignIn.Rejected["reason"], CodeError>> = {
  mismatch: "Mismatch",
  expired: "Expired",
  unknown: "Unknown"
}

/** Why the host did not give a session for the code: it says why it rejected the code, or it could not check it. */
const codeErrorOf = (error: unknown): CodeError =>
  Schema.is(SignIn.Rejected)(error) ? rejections[error.reason] : "VerifyFailed"

/**
 * Send a sign-in code to `email`. The client reports a status the contract does not list as a defect, which a failure
 * handler misses, so any cause of the request ends in the reason told for it and the form never stays waiting.
 */
export const SendCode = SignInDefinition.command("SendCode", {
  args: { email: Schema.String },
  messages: [Message.SucceededSendCode, Message.FailedSendCode],
  handler: function* () {
    const session = yield* Session.Session
    return ({ email }) =>
      Effect.gen(function* () {
        const address = yield* Schema.decodeEffect(Accounts.Email)(email).pipe(
          Effect.mapError(() => Message.FailedSendCode({ error: "InvalidEmail" }))
        )
        const client = yield* Api.client(session.apiUrl)
        yield* client.session
          .start({ payload: { email: address } })
          .pipe(
            Effect.catchCause((cause) =>
              Effect.fail(Message.FailedSendCode({ error: emailErrorOf(Cause.squash(cause)) }))
            )
          )
        return Message.SucceededSendCode()
      }).pipe(Effect.catch(Effect.succeed))
  }
})

/**
 * Exchange the code sent to `email` for a session, kept for the next visit before it is reported. As with `SendCode`,
 * any cause of the request ends in a reason, and a code the host rejected is told apart by why it did.
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
        }).pipe(Effect.mapError(() => Message.FailedSignIn({ error: "InvalidCode" })))
        const client = yield* Api.client(session.apiUrl)
        const signed = yield* client.session
          .complete({ payload })
          .pipe(
            Effect.catchCause((cause) => Effect.fail(Message.FailedSignIn({ error: codeErrorOf(Cause.squash(cause)) })))
          )
        yield* session.keep(signed)
        return Message.SucceededSignIn({ session: signed })
      }).pipe(Effect.catch(Effect.succeed))
  }
})

/** Move focus to the code's input, such as once a new code was sent and the person types it. */
export const FocusCode = SignInDefinition.command("FocusCode", {
  messages: [Message.CompletedFocusCode],
  handler: function* () {
    return () => Dom.focus(`#${codeFieldId}`).pipe(Effect.ignore, Effect.as(Message.CompletedFocusCode()))
  }
})

export const EffectsLayer = Layer.mergeAll(SendCode.layer, CheckCode.layer, FocusCode.layer)
