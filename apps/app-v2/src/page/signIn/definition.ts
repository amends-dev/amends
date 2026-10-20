/**
 * Signing in, a step at a time: an address to send a code to, then the code it was sent, from which
 * the person can go back to change the address or ask for another code. It keeps the session a right
 * code gives, and reports it.
 */

import * as SignIn from "@amends-dev/gateway/SignIn"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

/**
 * Where signing in has got to. The email step may carry a `notice` over the form, such as that a session ended,
 * which goes when the person sends the address.
 */
export const SignInForm = defineTaggedUnion({
  EnteringEmail: { email: Schema.String, error: Schema.Option(Schema.String), notice: Schema.Option(Schema.String) },
  SendingCode: { email: Schema.String },
  EnteringCode: { email: Schema.String, code: Schema.String, error: Schema.Option(Schema.String) },
  CheckingCode: { email: Schema.String, code: Schema.String }
})
export type SignInForm = typeof SignInForm.Type

export const Model = Schema.Struct({ form: SignInForm })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  TypedEmail: { email: Schema.String },
  SubmittedEmail: {},
  SucceededSendCode: {},
  FailedSendCode: { error: Schema.String },
  ClickedChangeEmail: {},
  ClickedSendAgain: {},
  TypedCode: { code: Schema.String },
  SubmittedCode: {},
  SucceededSignIn: { session: SignIn.Session },
  FailedSignIn: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  SignedIn: { session: SignIn.Session }
})
export type OutMessage = typeof OutMessage.Type

export const SignInDefinition = Block.makeDefinition("SignIn", { Model, Message, OutMessage })
