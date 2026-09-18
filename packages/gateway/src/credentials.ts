import { Identity } from "@amends/core/identity";
import { Context, Schema } from "effect";
import type { Effect, Redacted } from "effect";

/** A credential that authenticates nobody: not a token the host issued, or one it no longer honors. */
export class Rejected extends Schema.TaggedError<Rejected>()("Credentials.Rejected", {
  reason: Schema.Literals(["malformed", "unknown", "expired"]),
}) {}

export interface Interface {
  /**
   * Resolve a credential a client presented to the identity it authenticates.
   * Protocol packages call this from their own authentication mechanism, so a
   * host verifies tokens once for every protocol. Storage failures are defects.
   */
  readonly resolve: (
    token: Redacted.Redacted<string>,
  ) => Effect.Effect<Identity.Reference, Rejected>;
}

/**
 * The other half of sign-in: sign-in issues a token, and this says who holds
 * one. Hosts own both, along with the format and lifetime of their tokens.
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/credentials/Service",
) {}

export * as Credentials from "./credentials.ts";
