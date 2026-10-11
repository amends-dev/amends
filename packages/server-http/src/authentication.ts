import { Authentication, Credential, Principal, Unauthorized } from "@amends-dev/api-http";
import { SessionTokens } from "@amends-dev/gateway";
import { Effect, Layer } from "effect";

const messages: Record<SessionTokens.Rejected["reason"], string> = {
  malformed: "The bearer token is malformed",
  unknown: "The bearer token is not recognized",
  expired: "The bearer token has expired",
};

/**
 * Construct bearer middleware from the host's session tokens. Tokens and
 * principals are resolved for each request, never during construction.
 *
 * @category constructors
 */
export const make = Effect.fn("BearerAuthentication.make")(function* () {
  const sessionTokens = yield* SessionTokens.Service;
  return Authentication.of({
    bearer: (httpEffect, { credential }) =>
      sessionTokens.resolve(credential).pipe(
        Effect.mapError((rejected) => new Unauthorized({ message: messages[rejected.reason] })),
        Effect.flatMap((principal) =>
          httpEffect.pipe(
            Effect.provideService(Principal, principal),
            Effect.provideService(Credential, credential),
          ),
        ),
      ),
  });
});

/**
 * Provide the HTTP contract's authentication over the host's session tokens.
 *
 * @category layers
 */
export const layer = Layer.effect(Authentication, make());

export * as BearerAuthentication from "./authentication.ts";
