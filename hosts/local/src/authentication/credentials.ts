import { Identity } from "@amends/core/identity";
import { Credentials } from "@amends/gateway";
import { Effect, Layer, Redacted, Schema } from "effect";

/**
 * Construct development credentials that trust a nonempty bearer token as a human ID.
 *
 * @category constructors
 */
export const make = (): Credentials.Interface =>
  Credentials.Service.of({
    resolve: (token) =>
      Schema.decodeEffect(Identity.HumanId)(Redacted.value(token)).pipe(
        Effect.mapError(() => new Credentials.Rejected({ reason: "malformed" })),
        Effect.map((id) => Identity.Reference.cases.Human.make({ id })),
      ),
  });

/**
 * Provide the development credential resolver through its constructor.
 *
 * @category layers
 */
export const layer = Layer.sync(Credentials.Service, make);

export * as DevelopmentCredentials from "./credentials.ts";
