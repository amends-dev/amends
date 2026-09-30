import { Api, Principal } from "@amends/api-http";
import type { Actor } from "@amends/core/identity";
import { Turn, TurnApplication } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Streams } from "./streams.ts";

/**
 * Register turn handlers, capturing the gateway and reading the principal per request. Following
 * a turn's log is a stream held in the HTTP response scope, as change streams are: it counts
 * within the same limits, and ends with Turn.LogUnavailable when it cannot go on.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "turns",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    const streams = yield* Streams.Service;
    const unavailable = () => new Turn.LogUnavailable({});
    /** Run a turn operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (turns: TurnApplication.Interface) => Effect.Effect<A, E, Actor.Service>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(
          workspaceId,
          principal,
          Effect.flatMap(TurnApplication.Service, operation),
        ),
      );
    return handlers.handleAll({
      listByThread: ({ params, query }) =>
        asMember(params.workspaceId, (turns) => turns.listByThread(params.threadId, query.limit)),
      listActive: ({ params, query }) =>
        asMember(params.workspaceId, (turns) => turns.listActive(query.limit)),
      get: ({ params }) => asMember(params.workspaceId, (turns) => turns.get(params.turnId)),
      log: ({ params }) => asMember(params.workspaceId, (turns) => turns.log(params.turnId)),
      watchLog: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          streams.hold(params.workspaceId, principal).pipe(
            Effect.andThen(
              gateway.asMemberScoped(
                params.workspaceId,
                principal,
                Effect.flatMap(TurnApplication.Service, (turns) =>
                  Effect.map(turns.watchLog(params.turnId), (stream) =>
                    streams.serve(stream, unavailable),
                  ),
                ),
              ),
            ),
          ),
        ).pipe(Streams.withHeartbeats),
      cancel: ({ params }) => asMember(params.workspaceId, (turns) => turns.cancel(params.turnId)),
      retry: ({ params }) => asMember(params.workspaceId, (turns) => turns.retry(params.turnId)),
    });
  }),
).pipe(Layer.provide(Streams.layer));

export * as TurnsHandlers from "./turns.ts";
