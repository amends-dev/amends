import { Api, Principal } from "@amends/api-http";
import { ConnectionV2Service } from "@amends/core/connection-v2";
import type { Actor } from "@amends/core/identity";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the handlers of connections v2, capturing the gateway and reading the principal per
 * request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "connectionsV2",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    /** Run a connection operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (
        connectionV2Service: ConnectionV2Service.Interface,
      ) => Effect.Effect<A, E, Actor.Service>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(
          workspaceId,
          principal,
          Effect.flatMap(ConnectionV2Service.Service, operation),
        ),
      );
    return handlers.handleAll({
      integrations: ({ params }) =>
        asMember(params.workspaceId, (connectionV2Service) => connectionV2Service.integrations),
      list: ({ params }) =>
        asMember(params.workspaceId, (connectionV2Service) => connectionV2Service.list),
      create: ({ params, headers, payload }) =>
        asMember(params.workspaceId, (connectionV2Service) =>
          connectionV2Service.create(payload, { requestKey: headers["idempotency-key"] }),
        ),
      get: ({ params }) =>
        asMember(params.workspaceId, (connectionV2Service) =>
          connectionV2Service.get(params.connectionId),
        ),
      rename: ({ params, payload }) =>
        asMember(params.workspaceId, (connectionV2Service) =>
          connectionV2Service.rename({
            connectionId: params.connectionId,
            name: payload.name,
            expectedName: payload.expectedName,
          }),
        ),
      configure: ({ params, payload }) =>
        asMember(params.workspaceId, (connectionV2Service) =>
          connectionV2Service.configure({
            connectionId: params.connectionId,
            settings: payload.settings,
          }),
        ),
      replaceKey: ({ params, payload }) =>
        asMember(params.workspaceId, (connectionV2Service) =>
          connectionV2Service.replaceKey({
            connectionId: params.connectionId,
            apiKey: payload.apiKey,
          }),
        ),
      check: ({ params }) =>
        asMember(params.workspaceId, (connectionV2Service) =>
          connectionV2Service.check(params.connectionId),
        ),
      remove: ({ params }) =>
        asMember(params.workspaceId, (connectionV2Service) =>
          connectionV2Service.remove(params.connectionId),
        ),
    });
  }),
);

export * as ConnectionsV2Handlers from "./connections-v2.ts";
