import { Authentication, Principal, Unauthorized } from "@amends/api-http";
import { Credentials } from "@amends/gateway";
import { Effect, Layer } from "effect";

const messages: Record<Credentials.Rejected["reason"], string> = {
  malformed: "The bearer token is malformed",
  unknown: "The bearer token is not recognized",
  expired: "The bearer token has expired",
};

/**
 * The contract's bearer scheme over the host's credential resolution. This is
 * the only place HTTP authentication meets the gateway: hosts never see the
 * middleware, and other protocols adapt the same contract their own way.
 */
export const layer = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const credentials = yield* Credentials.Service;
    return Authentication.of({
      bearer: (httpEffect, { credential }) =>
        credentials.resolve(credential).pipe(
          Effect.mapError((rejected) => new Unauthorized({ message: messages[rejected.reason] })),
          Effect.flatMap((principal) => Effect.provideService(httpEffect, Principal, principal)),
        ),
    });
  }),
);

export * as BearerAuthentication from "./authentication.ts";
