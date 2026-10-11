/**
 * Implements `ConnectionsGroup`. Each handler enters the workspace as the principal's membership
 * through `Gateway.asMember` and calls one `ConnectionService` operation, merging the path's
 * connection ID, the body, and the `Idempotency-Key` header into its input. `Routes` composes its
 * `layer` with the other groups'.
 *
 * @since 0.1.0
 */
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
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api,
  "connections",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    /** Run a connection operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (
        connectionService: ConnectionService.ConnectionService["Service"],
      ) => Effect.Effect<A, E, Actor.Actor>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(
          workspaceId,
          principal,
          Effect.flatMap(ConnectionService.ConnectionService, operation),
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
