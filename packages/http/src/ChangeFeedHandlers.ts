/**
 * Implements `ChangeFeedGroup`, a workspace's live changes as server-sent events. In the workspace
 * `WorkspaceMember` entered as the principal's membership, the handler holds a place within the
 * `Streams` limits and serves `ChangeFeedService.watch`'s stream through `Streams.serve`, with
 * heartbeats from `Streams.withHeartbeats`. The HTTP response's scope keeps the workspace and the
 * subscription open until the stream completes or the client disconnects.
 *
 * @since 0.1.0
 */

import { ChangeFeedService } from "@amends-dev/core/change-feed"
import { CoreError } from "@amends-dev/core/error"
import { Actor } from "@amends-dev/core/identity"
import * as Effect from "effect/Effect"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as Layer from "effect/Layer"
import * as Api from "./Api.ts"
import * as Authentication from "./Authentication.ts"
import * as Streams from "./Streams.ts"

/**
 * Register the change feed handler, which acquires the subscription in the HTTP response scope,
 * closed on disconnect. Each stream holds a place within the workspace's and its member's limits
 * until then, and ends with `CoreError.Unavailable`, which tells the client to reconnect.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "changeFeed",
  Effect.fn(function* (handlers) {
    const streams = yield* Streams.Streams
    const unavailable = () => new CoreError.Unavailable({ reason: new CoreError.ChangeFeedInterrupted() })
    return handlers.handleAll({
      watch: ({ query }) =>
        Effect.gen(function* () {
          const { workspaceId } = yield* Actor.Actor
          yield* streams.hold(workspaceId, yield* Authentication.Principal)
          const changeFeedService = yield* ChangeFeedService.ChangeFeedService
          return streams.serve(yield* changeFeedService.watch(query), unavailable)
        }).pipe(Streams.withHeartbeats)
    })
  })
).pipe(Layer.provide(Streams.layer))
