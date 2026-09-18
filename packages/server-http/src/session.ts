import { Api } from "@amends/api-http";
import { SignIn } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

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
      start: ({ payload }) => signIn.start(payload.email),
      complete: ({ payload }) => signIn.complete(payload.email, payload.code),
    });
  }),
);

export * as SessionHandlers from "./session.ts";
