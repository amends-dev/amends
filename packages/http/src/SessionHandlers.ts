/**
 * Implements `SessionGroup` over the host's `SignIn` service, with no principal and no workspace:
 * `methods` answers `SignIn.methods`, `start` asks `SignIn.start` to email a code, passing the
 * request's remote address so sign-in can limit codes by it, and `complete` exchanges the code
 * through `SignIn.complete`. `Routes` composes its `layer` with the other groups'.
 *
 * @since 0.1.0
 */

import { SignIn } from "@amends-dev/gateway"
import * as Effect from "effect/Effect"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as Option from "effect/Option"
import * as Api from "./Api.ts"

/**
 * Register session handlers over the host's sign-in service, which limits codes by the address a
 * request came from.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "session",
  Effect.fn(function* (handlers) {
    const signIn = yield* SignIn.SignIn
    return handlers.handleAll({
      methods: () => Effect.succeed(signIn.methods),
      start: ({ payload, request }) => signIn.start(payload.email, Option.getOrUndefined(request.remoteAddress)),
      complete: ({ payload }) => signIn.complete(payload.email, payload.code)
    })
  })
)
