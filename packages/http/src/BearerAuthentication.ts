/**
 * The server's side of the contract's `Authentication`. Each request's bearer token is resolved
 * through the host's `SessionTokens.resolve`, and the handler runs with the `Principal` it names
 * and the `Credential` itself; a token the host rejects fails with `Unauthorized`, saying whether
 * it was malformed, unknown, or expired. `Routes.layerHandlers` provides `layer` to every group's
 * handlers.
 *
 * @since 0.1.0
 */
import * as Authentication from "./Authentication.ts";
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
 * @since 0.1.0
 */
export const make = Effect.fn("BearerAuthentication.make")(function* () {
  const sessionTokens = yield* SessionTokens.SessionTokens;
  return Authentication.Authentication.of({
    bearer: (httpEffect, { credential }) =>
      sessionTokens.resolve(credential).pipe(
        Effect.mapError(
          (rejected) => new Authentication.Unauthorized({ message: messages[rejected.reason] }),
        ),
        Effect.flatMap((principal) =>
          httpEffect.pipe(
            Effect.provideService(Authentication.Principal, principal),
            Effect.provideService(Authentication.Credential, credential),
          ),
        ),
      ),
  });
});

/**
 * Provide the HTTP contract's authentication over the host's session tokens.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Authentication.Authentication, make());
