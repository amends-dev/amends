import { Api, Principal } from "@amends/api-http";
import { ChangeFeed, ChangeFeedApplication } from "@amends/core/change-feed";
import { SignalApplication } from "@amends/core/signal";
import { Gateway } from "@amends/gateway";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Streams } from "./streams.ts";

/**
 * Acquire the subscription in the HTTP response scope, which closes on disconnect. Each stream
 * holds a place within the workspace's and its member's limits until then, and ends with
 * ChangeFeed.Unavailable, which tells the client to reconnect.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "changes",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    const streams = yield* Streams.Service;
    const unavailable = () => new ChangeFeed.Unavailable({});
    return handlers.handleAll({
      watch: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          streams.hold(params.workspaceId, principal).pipe(
            Effect.andThen(
              gateway.asMemberScoped(
                params.workspaceId,
                principal,
                Effect.flatMap(ChangeFeedApplication.Service, (changes) =>
                  Effect.map(changes.watch(query), (stream) => streams.serve(stream, unavailable)),
                ),
              ),
            ),
          ),
        ).pipe(Streams.withHeartbeats),
      typing: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(SignalApplication.Service, (signals) => signals.typing(params.threadId)),
          ),
        ),
    });
  }),
).pipe(Layer.provide(Streams.layer));

export * as ChangesHandlers from "./changes.ts";
