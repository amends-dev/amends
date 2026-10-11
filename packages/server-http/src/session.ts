import { Api } from "@amends-dev/api-http";
import { SignIn } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register session handlers over the host's sign-in service.
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
      start: ({ payload }) => signIn.start(payload.email),
      complete: ({ payload }) => signIn.complete(payload.email, payload.code),
    });
  }),
);

export * as SessionHandlers from "./session.ts";
