import { Identity } from "@amends-dev/core/identity";
import { SessionTokens } from "@amends-dev/gateway";
import { Effect, Layer, Redacted, Schema } from "effect";

/**
 * Construct development session tokens that trust a nonempty bearer token as a human ID. Such a
 * token cannot be revoked: signing out forgets it in the client alone.
 *
 * @category constructors
 */
export const make = (): SessionTokens.Interface =>
  SessionTokens.Service.of({
    resolve: (token) =>
      Schema.decodeEffect(Identity.HumanId)(Redacted.value(token)).pipe(
        Effect.mapError(() => new SessionTokens.Rejected({ reason: "malformed" })),
        Effect.map((id) => Identity.Reference.cases.Human.make({ id })),
      ),
    revoke: () => Effect.void,
  });

/**
 * Provide the development session tokens through their constructor.
 *
 * @category layers
 */
export const layer = Layer.sync(SessionTokens.Service, make);

export * as DevelopmentSessionTokens from "./session-tokens.ts";
