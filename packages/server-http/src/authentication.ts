import { Authentication, Principal, Unauthorized } from "@amends/api-http";
import { Credentials } from "@amends/gateway";
import { Effect, Layer } from "effect";

const messages: Record<Credentials.Rejected["reason"], string> = {
  malformed: "The bearer token is malformed",
  unknown: "The bearer token is not recognized",
  expired: "The bearer token has expired",
};

/**
 * Construct bearer middleware from the host's credential resolver. Credentials
 * and principals are resolved for each request, never during construction.
 *
 * @category constructors
 */
export const make = Effect.fn("BearerAuthentication.make")(function* () {
  const credentials = yield* Credentials.Service;
  return Authentication.of({
    bearer: (httpEffect, { credential }) =>
      credentials.resolve(credential).pipe(
        Effect.mapError((rejected) => new Unauthorized({ message: messages[rejected.reason] })),
        Effect.flatMap((principal) => Effect.provideService(httpEffect, Principal, principal)),
      ),
  });
});

/**
 * Provide the HTTP contract's authentication over the caller's credential resolver.
 *
 * @category layers
 */
export const layer = Layer.effect(Authentication, make());

export * as BearerAuthentication from "./authentication.ts";
