import { Identity } from "@amends/core/identity";
import { SessionTokens } from "@amends/gateway";
import { Effect, Layer, Redacted, Schema } from "effect";

/**
 * Construct development session tokens that trust a nonempty bearer token as a human ID.
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
  });

/**
 * Provide the development session tokens through their constructor.
 *
 * @category layers
 */
export const layer = Layer.sync(SessionTokens.Service, make);

export * as DevelopmentSessionTokens from "./session-tokens.ts";
