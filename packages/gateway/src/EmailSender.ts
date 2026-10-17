/**
 * How a host sends email through its provider. `EmailSignIn` sends sign-in codes with it, and
 * withdraws a code its provider did not accept. The host implements it over the provider it
 * chooses; the local host writes each message to its log until one is chosen.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import type * as Accounts from "./Accounts.ts"

/**
 * An email to send: to whom, its subject, and its text, which may carry a code.
 *
 * @category models
 * @since 0.1.0
 */
export interface Message {
  readonly to: Accounts.Email
  readonly subject: string
  readonly text: Redacted.Redacted<string>
}

/**
 * The email was not sent, or its provider could not say whether it was.
 *
 * @category errors
 * @since 0.1.0
 */
export class Undelivered extends Schema.TaggedError<Undelivered>()("EmailSender.Undelivered", {
  description: Schema.String
}) {
  override get message(): string {
    return this.description
  }
}

/**
 * How a host sends email, such as sign-in codes, through its provider.
 *
 * @category services
 * @since 0.1.0
 */
export class EmailSender extends Context.Service<
  EmailSender,
  {
    /** Hand the message to the email provider; success means the provider accepted it. */
    readonly send: (message: Message) => Effect.Effect<void, Undelivered>
  }
>()("@amends-dev/gateway/EmailSender") {}
