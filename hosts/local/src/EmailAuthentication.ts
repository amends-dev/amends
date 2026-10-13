/**
 * Email authentication, the host's default: the gateway's `EmailSignIn` over the host's sign-in
 * storage and accounts, with emails logged where the server runs until the host has an email
 * provider, so whoever reads the log can sign in as anyone who asks for a code. Its code key
 * derives from the credential key, which every process over the database shares.
 *
 * @since 0.1.0
 */
import { EmailSender, EmailSignIn } from "@amends-dev/gateway";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as LocalConfig from "./LocalConfig.ts";

/**
 * Send email by logging it where the server runs, as the host does until it is given an email
 * provider. Whoever reads the log can sign in as anyone who asks for a code.
 *
 * @category constructors
 * @since 0.1.0
 */
export const logEmails = EmailSender.EmailSender.of({
  send: (message) =>
    Effect.logInfo(`Email to ${message.to}: ${message.subject}\n${Redacted.value(message.text)}`),
});

/**
 * Compose email sign-in and its sessions over the host's sign-in storage, accounts, and
 * cryptography, with emails logged. Codes are digested under a key derived from the credential
 * key, so that a code one host sent works on every host over the database; without a credential
 * key, a code works only on the process that sent it.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (credentialKey: Redacted.Redacted<string> | undefined) =>
  EmailSignIn.layer({
    codeKey: Redacted.make(LocalConfig.deriveSecret(credentialKey, "amends/sign-in-codes")),
  }).pipe(Layer.provide(Layer.succeed(EmailSender.EmailSender, logEmails)));
