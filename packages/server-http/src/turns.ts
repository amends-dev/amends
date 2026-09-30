import { Api, Principal } from "@amends/api-http";
import type { Actor } from "@amends/core/identity";
import { TurnApplication } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register turn handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "turns",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
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
      cancel: ({ params }) => asMember(params.workspaceId, (turns) => turns.cancel(params.turnId)),
      retry: ({ params, headers }) =>
        asMember(params.workspaceId, (turns) =>
          turns.retry(params.turnId, { requestKey: headers["idempotency-key"] }),
        ),
    });
  }),
);

export * as TurnsHandlers from "./turns.ts";
