/**
 * Implements `ChangeFeedGroup`, a workspace's live changes as server-sent events. The handler holds
 * a place within the `Streams` limits, enters the workspace as the principal's membership through
 * `Gateway.asMember`, and serves `ChangeFeedService.watch`'s stream through `Streams.serve`, with
 * heartbeats from `Streams.withHeartbeats`. The HTTP response's scope keeps the workspace and the
 * subscription open until the stream completes or the client disconnects.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import * as Authentication from "./Authentication.ts";
import { ChangeFeedService } from "@amends-dev/core/change-feed";
import { Gateway } from "@amends-dev/gateway";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import * as Streams from "./Streams.ts";
import { CoreError } from "@amends-dev/core/error";

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
    const gateway = yield* Gateway.Gateway;
    const streams = yield* Streams.Streams;
    const unavailable = () =>
      new CoreError.Unavailable({ reason: new CoreError.ChangeFeedInterrupted() });
    return handlers.handleAll({
      watch: ({ params, query }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          streams.hold(params.workspaceId, principal).pipe(
            Effect.andThen(
              gateway.asMember(
                params.workspaceId,
                principal,
                Effect.flatMap(ChangeFeedService.ChangeFeedService, (changeFeedService) =>
                  Effect.map(changeFeedService.watch(query), (stream) =>
                    streams.serve(stream, unavailable),
                  ),
                ),
              ),
            ),
          ),
        ).pipe(Streams.withHeartbeats),
    });
  }),
).pipe(Layer.provide(Streams.layer));
