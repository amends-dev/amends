import { Api, Principal } from "@amends-dev/api-http";
import { ChangeFeed, ChangeFeedService } from "@amends-dev/core/change-feed";
import { Gateway } from "@amends-dev/gateway";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import * as Streams from "./Streams.ts";

/**
 * Acquire the subscription in the HTTP response scope, which closes on disconnect. Each stream
 * holds a place within the workspace's and its member's limits until then, and ends with
 * ChangeFeed.Unavailable, which tells the client to reconnect.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "changeFeed",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    const streams = yield* Streams.Streams;
    const unavailable = () => new ChangeFeed.Unavailable({});
    return handlers.handleAll({
      watch: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
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
