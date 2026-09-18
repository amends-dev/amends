import { Authentication, Principal, Unauthorized } from "@amends/api-http";
import { Identity } from "@amends/core/identity";
import { Effect, Layer, Redacted, Schema } from "effect";

/**
 * Development authentication: the bearer token is the human ID it asserts.
 * This mirrors the CLI's trusted local operator assertions. It is not a
 * public authentication scheme; a network host must verify credentials.
 */
export const layer = Layer.succeed(
  Authentication,
  Authentication.of({
    bearer: (httpEffect, { credential }) =>
      Schema.decodeEffect(Identity.HumanId)(Redacted.value(credential)).pipe(
        Effect.mapError(
          () => new Unauthorized({ message: "The bearer token must be a non-empty human ID" }),
        ),
        Effect.flatMap((id) =>
          Effect.provideService(httpEffect, Principal, Identity.Reference.cases.Human.make({ id })),
        ),
      ),
  }),
);

export * as LocalAuthentication from "./authentication.ts";
