/**
 * Implements `TurnsGroup`. Each handler enters the workspace as the principal's membership through
 * `Gateway.asMember` and calls one `TurnService` operation. Following a turn's log holds a place
 * within the `Streams` limits and serves `TurnService.watchLog`'s stream through `Streams.serve`,
 * with heartbeats, so a log and the change feed share one count of open streams.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import * as Authentication from "./Authentication.ts";
import type { Actor } from "@amends-dev/core/identity";
import { Turn, TurnService } from "@amends-dev/core/turn";
import type { Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import * as Streams from "./Streams.ts";

/**
 * Register turn handlers, capturing the gateway and reading the principal per request. Following
 * a turn's log is a stream held in the HTTP response scope, as change streams are: it counts
 * within the same limits, and ends with `Turn.LogUnavailable` when it cannot go on.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "turns",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    const streams = yield* Streams.Streams;
    const unavailable = () => new Turn.LogUnavailable({});
    /** Run a turn operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (
        turnService: TurnService.TurnService["Service"],
      ) => Effect.Effect<A, E, Actor.Actor>,
    ) =>
      Effect.flatMap(Authentication.Principal, (principal) =>
        gateway.asMember(
          workspaceId,
          principal,
          Effect.flatMap(TurnService.TurnService, operation),
        ),
      );
    return handlers.handleAll({
      listActive: ({ params, query }) =>
        asMember(params.workspaceId, (turnService) => turnService.listActive(query.limit)),
      get: ({ params }) =>
        asMember(params.workspaceId, (turnService) => turnService.get(params.turnId)),
      watchLog: ({ params }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          streams.hold(params.workspaceId, principal).pipe(
            Effect.andThen(
              gateway.asMember(
                params.workspaceId,
                principal,
                Effect.flatMap(TurnService.TurnService, (turnService) =>
                  Effect.map(turnService.watchLog(params.turnId), (stream) =>
                    streams.serve(stream, unavailable),
                  ),
                ),
              ),
            ),
          ),
        ).pipe(Streams.withHeartbeats),
      cancel: ({ params }) =>
        asMember(params.workspaceId, (turnService) => turnService.cancel(params.turnId)),
      retry: ({ params }) =>
        asMember(params.workspaceId, (turnService) => turnService.retry(params.turnId)),
    });
  }),
).pipe(Layer.provide(Streams.layer));
