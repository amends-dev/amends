import { Api, Principal } from "@amends-dev/api-http";
import { ConnectionService } from "@amends-dev/core/connection";
import type { Actor } from "@amends-dev/core/identity";
import type { Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the handlers of connections, capturing the gateway and reading the principal per
 * request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "connections",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    /** Run a connection operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (
        connectionService: ConnectionService.Interface,
      ) => Effect.Effect<A, E, Actor.Service>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(
          workspaceId,
          principal,
          Effect.flatMap(ConnectionService.Service, operation),
        ),
      );
    return handlers.handleAll({
      integrations: ({ params }) =>
        asMember(params.workspaceId, (connectionService) => connectionService.integrations),
      list: ({ params }) =>
        asMember(params.workspaceId, (connectionService) => connectionService.list),
      create: ({ params, headers, payload }) =>
        asMember(params.workspaceId, (connectionService) =>
          connectionService.create(payload, { requestKey: headers["idempotency-key"] }),
        ),
      get: ({ params }) =>
        asMember(params.workspaceId, (connectionService) =>
          connectionService.get(params.connectionId),
        ),
      models: ({ params }) =>
        asMember(params.workspaceId, (connectionService) =>
          connectionService.models(params.connectionId),
        ),
      rename: ({ params, payload }) =>
        asMember(params.workspaceId, (connectionService) =>
          connectionService.rename({
            connectionId: params.connectionId,
            name: payload.name,
            expectedName: payload.expectedName,
          }),
        ),
      configure: ({ params, payload }) =>
        asMember(params.workspaceId, (connectionService) =>
          connectionService.configure({
            connectionId: params.connectionId,
            settings: payload.settings,
          }),
        ),
      replaceKey: ({ params, payload }) =>
        asMember(params.workspaceId, (connectionService) =>
          connectionService.replaceKey({
            connectionId: params.connectionId,
            apiKey: payload.apiKey,
          }),
        ),
      check: ({ params }) =>
        asMember(params.workspaceId, (connectionService) =>
          connectionService.check(params.connectionId),
        ),
      remove: ({ params }) =>
        asMember(params.workspaceId, (connectionService) =>
          connectionService.remove(params.connectionId),
        ),
    });
  }),
);

export * as ConnectionsHandlers from "./connections.ts";
