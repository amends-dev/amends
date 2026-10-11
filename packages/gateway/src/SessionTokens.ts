/**
 * How a host says who holds a session token. Sign-in issues the token, and this resolves it on
 * every request into the identity the gateway runs programs as: server-http's bearer
 * authentication calls `resolve`, and signing out calls `revoke`. `EmailSignIn` implements it over
 * `SignInStorage`; the local host's development sign-in has its own.
 *
 * @since 0.1.0
 */
import { Identity } from "@amends-dev/core/identity";
import { Context, Schema } from "effect";
import type { Effect, Redacted } from "effect";

/**
 * A token that authenticates nobody: not one the host issued, or one it no longer honors.
 *
 * @category errors
 * @since 0.1.0
 */
export class Rejected extends Schema.TaggedError<Rejected>()("SessionTokens.Rejected", {
  reason: Schema.Literals(["malformed", "unknown", "expired"]),
}) {}

/**
 * The other half of sign-in: sign-in issues a token, and this says who holds
 * one. Hosts own both, along with the format and lifetime of their tokens.
 *
 * @category services
 * @since 0.1.0
 */
export class SessionTokens extends Context.Service<
  SessionTokens,
  {
    /**
     * Resolve a session token a client presented to the identity it authenticates.
     * Protocol packages call this from their own authentication mechanism, so a
     * host verifies tokens once for every protocol. Storage failures are defects.
     */
    readonly resolve: (
      token: Redacted.Redacted<string>,
    ) => Effect.Effect<Identity.MemberReference, Rejected>;
    /**
     * Stop honoring a token, as signing out does. A token the host does not honor already is left
     * as it is.
     */
    readonly revoke: (token: Redacted.Redacted<string>) => Effect.Effect<void>;
  }
>()("@amends-dev/gateway/session-tokens/Service") {}
