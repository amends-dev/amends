/**
 * Implements `PresenceGroup`. Each handler runs in the workspace `WorkspaceMember` entered as the
 * principal's membership, and calls one `PresenceService` operation. Following presence holds a
 * place within the `Streams` limits and serves `PresenceService.watch`'s stream through
 * `Streams.serve`, with heartbeats, as turn logs are.
 *
 * @since 0.1.0
 */

import { CoreError } from "@amends-dev/core/error"
import { Actor } from "@amends-dev/core/identity"
import { PresenceService } from "@amends-dev/core/presence"
import * as Effect from "effect/Effect"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as Layer from "effect/Layer"
import * as Api from "./Api.ts"
import * as Authentication from "./Authentication.ts"
import * as Streams from "./Streams.ts"

/**
 * Register presence handlers, reading the principal per request. Following presence is a stream
 * held in the HTTP response scope, which keeps the caller present for as long as it is open.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "presence",
  Effect.fn(function* (handlers) {
    const streams = yield* Streams.Streams
    const unavailable = () => new CoreError.Unavailable({ reason: new CoreError.LogInterrupted() })
    return handlers.handleAll({
      watch: () =>
        Effect.gen(function* () {
          const { workspaceId } = yield* Actor.Actor
          yield* streams.hold(workspaceId, yield* Authentication.Principal)
          const presenceService = yield* PresenceService.PresenceService
          return streams.serve(yield* presenceService.watch, unavailable)
        }).pipe(Streams.withHeartbeats),
      type: ({ payload }) =>
        PresenceService.PresenceService.use((presenceService) => presenceService.type(payload.threadId))
    })
  })
).pipe(Layer.provide(Streams.layer))
