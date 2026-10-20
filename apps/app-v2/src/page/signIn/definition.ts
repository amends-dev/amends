/**
 * Signing in, a step at a time: an address to send a code to, then the code it was sent, from which
 * the person can go back to change the address or ask for another code. The code is checked as soon as its
 * sixth digit is typed, or when the person sends the form. While a code is asked for or checked the form stays
 * where it is, with the button that sent it disabled. It keeps the session a right code gives, and reports it.
 */

import * as SignIn from "@amends-dev/gateway/SignIn"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

/** Why a code was not requested: the address is not one, too many were requested lately, or the request failed. */
export const EmailError = Schema.Literals(["InvalidEmail", "RateLimited", "RequestFailed"])
export type EmailError = typeof EmailError.Type

/**
 * Why a code was not accepted or sent again: it is not six digits, it does not match the one sent, has expired, or is
 * no longer one the host holds, the host could not check it, or too many codes were requested lately or the request
 * for a new one failed.
 */
export const CodeError = Schema.Literals([
  "InvalidCode",
  "Mismatch",
  "Expired",
  "Unknown",
  "VerifyFailed",
  "ResendLimited",
  "ResendFailed"
])
export type CodeError = typeof CodeError.Type

/** How many digits the code has. */
export const codeLength = 6

/**
 * Where signing in has got to. The email step may carry a `notice` over the form, such as that a session ended,
 * which goes when the person sends the address. The code step is `isResent` once the code it is for is one the person
 * asked for again, until they have it checked. A code is asked for or checked with the form where it is: the person
 * is `SendingCode` or `ResendingCode`, the latter with what they have typed of the code, or `CheckingCode`.
 */
export const SignInForm = defineTaggedUnion({
  EnteringEmail: { email: Schema.String, error: Schema.Option(EmailError), notice: Schema.Option(Schema.String) },
  SendingCode: { email: Schema.String },
  EnteringCode: {
    email: Schema.String,
    code: Schema.String,
    error: Schema.Option(CodeError),
    isResent: Schema.Boolean
  },
  ResendingCode: { email: Schema.String, code: Schema.String },
  CheckingCode: { email: Schema.String, code: Schema.String }
})
export type SignInForm = typeof SignInForm.Type

export const Model = Schema.Struct({ form: SignInForm })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  TypedEmail: { email: Schema.String },
  SubmittedEmail: {},
  SucceededSendCode: {},
  FailedSendCode: { error: EmailError },
  ClickedChangeEmail: {},
  ClickedSendAgain: {},
  TypedCode: { code: Schema.String },
  CompletedCode: { code: Schema.String },
  SubmittedCode: {},
  SucceededSignIn: { session: SignIn.Session },
  FailedSignIn: { error: CodeError },
  CompletedFocusCode: {}
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  SignedIn: { session: SignIn.Session }
})
export type OutMessage = typeof OutMessage.Type

export const SignInDefinition = Block.makeDefinition("SignIn", { Model, Message, OutMessage })
