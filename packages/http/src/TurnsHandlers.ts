/**
 * Implements `TurnsGroup`. Each handler runs in the workspace `WorkspaceMember` entered as the
 * principal's membership, and calls one `TurnService` operation. Following a turn's log holds a
 * place within the `Streams` limits and serves `TurnService.watchLog`'s stream through
 * `Streams.serve`, with heartbeats, so a log and the change feed share one count of open streams.
 *
 * @since 0.1.0
 */

import { CoreError } from "@amends-dev/core/error"
import { Actor } from "@amends-dev/core/identity"
import { TurnService } from "@amends-dev/core/turn"
import * as Effect from "effect/Effect"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as Layer from "effect/Layer"
import * as Api from "./Api.ts"
import * as Authentication from "./Authentication.ts"
import * as Streams from "./Streams.ts"

/**
 * Register turn handlers, reading the principal per request. Following a turn's log is a stream
 * held in the HTTP response scope, as change streams are: it counts within the same limits, and
 * ends with `CoreError.Unavailable` when it cannot go on.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "turns",
  Effect.fn(function* (handlers) {
    const streams = yield* Streams.Streams
    const unavailable = () => new CoreError.Unavailable({ reason: new CoreError.LogInterrupted() })
    return handlers.handleAll({
      listActive: ({ query }) => TurnService.TurnService.use((turnService) => turnService.listActive(query.limit)),
      get: ({ params }) => TurnService.TurnService.use((turnService) => turnService.get(params.turnId)),
      watchLog: ({ params }) =>
        Effect.gen(function* () {
          const { workspaceId } = yield* Actor.Actor
          yield* streams.hold(workspaceId, yield* Authentication.Principal)
          const turnService = yield* TurnService.TurnService
          return streams.serve(yield* turnService.watchLog(params.turnId), unavailable)
        }).pipe(Streams.withHeartbeats),
      cancel: ({ params }) => TurnService.TurnService.use((turnService) => turnService.cancel(params.turnId)),
      retry: ({ params }) => TurnService.TurnService.use((turnService) => turnService.retry(params.turnId))
    })
  })
).pipe(Layer.provide(Streams.layer))
