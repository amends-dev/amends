import { Api, Principal } from "@amends/api-http";
import { ConnectionApplication } from "@amends/core/connection";
import type { Actor } from "@amends/core/identity";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register connection handlers, capturing the gateway and reading the principal per request.
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
        connectionApplication: ConnectionApplication.Interface,
      ) => Effect.Effect<A, E, Actor.Service>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(
          workspaceId,
          principal,
          Effect.flatMap(ConnectionApplication.Service, operation),
        ),
      );
    return handlers.handleAll({
      implementations: ({ params }) =>
        asMember(params.workspaceId, (connectionApplication) =>
          Effect.succeed(connectionApplication.implementations),
        ),
      list: ({ params }) =>
        asMember(params.workspaceId, (connectionApplication) => connectionApplication.list),
      create: ({ params, headers, payload }) =>
        asMember(params.workspaceId, (connectionApplication) =>
          connectionApplication.create(payload, { requestKey: headers["idempotency-key"] }),
        ),
      get: ({ params }) =>
        asMember(params.workspaceId, (connectionApplication) =>
          connectionApplication.get(params.connectionId),
        ),
      rename: ({ params, payload }) =>
        asMember(params.workspaceId, (connectionApplication) =>
          connectionApplication.rename({
            connectionId: params.connectionId,
            name: payload.name,
            expectedName: payload.expectedName,
          }),
        ),
      configure: ({ params, payload }) =>
        asMember(params.workspaceId, (connectionApplication) =>
          connectionApplication.configure({
            connectionId: params.connectionId,
            settings: payload.settings,
          }),
        ),
      setCredential: ({ params, payload }) =>
        asMember(params.workspaceId, (connectionApplication) =>
          connectionApplication.setCredential({
            connectionId: params.connectionId,
            secret: payload.secret,
          }),
        ),
      clearCredential: ({ params }) =>
        asMember(params.workspaceId, (connectionApplication) =>
          connectionApplication.clearCredential(params.connectionId),
        ),
      remove: ({ params }) =>
        asMember(params.workspaceId, (connectionApplication) =>
          connectionApplication.remove(params.connectionId),
        ),
    });
  }),
);

export * as ConnectionsHandlers from "./connections.ts";
