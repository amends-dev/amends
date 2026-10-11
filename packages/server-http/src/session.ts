import { Api } from "@amends-dev/api-http";
import { SignIn } from "@amends-dev/gateway";
import { Effect, Option } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register session handlers over the host's sign-in service, which limits codes by the address a
 * request came from.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "session",
  Effect.fn(function* (handlers) {
    const signIn = yield* SignIn.Service;
    return handlers.handleAll({
      methods: () => Effect.succeed(signIn.methods),
      start: ({ payload, request }) =>
        signIn.start(payload.email, Option.getOrUndefined(request.remoteAddress)),
      complete: ({ payload }) => signIn.complete(payload.email, payload.code),
    });
  }),
);

export * as SessionHandlers from "./session.ts";
