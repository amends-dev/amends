import { Identity } from "@amends-dev/core/identity";
import { Context, Schema } from "effect";
import type { Effect, Redacted } from "effect";

/** A token that authenticates nobody: not one the host issued, or one it no longer honors. */
export class Rejected extends Schema.TaggedError<Rejected>()("SessionTokens.Rejected", {
  reason: Schema.Literals(["malformed", "unknown", "expired"]),
}) {}

export interface Interface {
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

/**
 * The other half of sign-in: sign-in issues a token, and this says who holds
 * one. Hosts own both, along with the format and lifetime of their tokens.
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/gateway/session-tokens/Service",
) {}

export * as SessionTokens from "./session-tokens.ts";
