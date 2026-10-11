import { Context, Schema } from "effect";
import type { Effect, Redacted } from "effect";
import type * as Accounts from "./Accounts.ts";

/** An email to send: to whom, its subject, and its text, which may carry a code. */
export interface Message {
  readonly to: Accounts.Email;
  readonly subject: string;
  readonly text: Redacted.Redacted<string>;
}

/** The email was not sent, or its provider could not say whether it was. */
export class Undelivered extends Schema.TaggedError<Undelivered>()("EmailSender.Undelivered", {
  description: Schema.String,
}) {
  override get message(): string {
    return this.description;
  }
}

/**
 * How a host sends email, such as sign-in codes, through its provider.
 */
export class EmailSender extends Context.Service<
  EmailSender,
  {
    /** Hand the message to the email provider; success means the provider accepted it. */
    readonly send: (message: Message) => Effect.Effect<void, Undelivered>;
  }
>()("@amends-dev/gateway/email-sender/Service") {}
