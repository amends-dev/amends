import { EmailSender, EmailSignIn } from "@amends-dev/gateway";
import { Effect, Layer, Redacted } from "effect";
import { LocalHost } from "../host.ts";

/**
 * Send email by logging it where the server runs, as the host does until it is given an email
 * provider. Whoever reads the log can sign in as anyone who asks for a code.
 */
export const logEmails = EmailSender.Service.of({
  send: (message) =>
    Effect.logInfo(`Email to ${message.to}: ${message.subject}\n${Redacted.value(message.text)}`),
});

/**
 * Compose email sign-in and its sessions over the host's sign-in storage, accounts, and
 * cryptography, with emails logged. Codes are digested under a key derived from the credential
 * key, so that a code one host sent works on every host over the database.
 *
 * @category layers
 */
export const layer = (credentialKey: Redacted.Redacted<string> | undefined) =>
  EmailSignIn.layer({
    codeKey: Redacted.make(LocalHost.deriveSecret(credentialKey, "amends/sign-in-codes")),
  }).pipe(Layer.provide(Layer.succeed(EmailSender.Service, logEmails)));

export * as EmailAuthentication from "./email.ts";
