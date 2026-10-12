/**
 * Implements `ConnectionsGroup`. Each handler enters the workspace as the principal's membership
 * through `Gateway.asMember` and calls one `ConnectionService` operation, merging the path's
 * connection ID, the body, and the `Idempotency-Key` header into its input. `Routes` composes its
 * `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { makeAsMember } from "./internal/as-member.ts";
import { ConnectionService } from "@amends-dev/core/connection";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the handlers of connections, each entering the workspace
 * as the request\'s principal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "connections",
  Effect.fn(function* (handlers) {
    const asMember = yield* makeAsMember;
    return handlers.handleAll({
      integrations: ({ params }) =>
        asMember(
          params.workspaceId,
          ConnectionService.ConnectionService.use(
            (connectionService) => connectionService.integrations,
          ),
        ),
      list: ({ params }) =>
        asMember(
          params.workspaceId,
          ConnectionService.ConnectionService.use((connectionService) => connectionService.list),
        ),
      create: ({ params, headers, payload }) =>
        asMember(
          params.workspaceId,
          ConnectionService.ConnectionService.use((connectionService) =>
            connectionService.create(payload, { requestKey: headers["idempotency-key"] }),
          ),
        ),
      get: ({ params }) =>
        asMember(
          params.workspaceId,
          ConnectionService.ConnectionService.use((connectionService) =>
            connectionService.get(params.connectionId),
          ),
        ),
      models: ({ params }) =>
        asMember(
          params.workspaceId,
          ConnectionService.ConnectionService.use((connectionService) =>
            connectionService.models(params.connectionId),
          ),
        ),
      rename: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          ConnectionService.ConnectionService.use((connectionService) =>
            connectionService.rename({
              connectionId: params.connectionId,
              name: payload.name,
              expectedName: payload.expectedName,
            }),
          ),
        ),
      configure: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          ConnectionService.ConnectionService.use((connectionService) =>
            connectionService.configure({
              connectionId: params.connectionId,
              settings: payload.settings,
            }),
          ),
        ),
      replaceKey: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          ConnectionService.ConnectionService.use((connectionService) =>
            connectionService.replaceKey({
              connectionId: params.connectionId,
              apiKey: payload.apiKey,
            }),
          ),
        ),
      check: ({ params }) =>
        asMember(
          params.workspaceId,
          ConnectionService.ConnectionService.use((connectionService) =>
            connectionService.check(params.connectionId),
          ),
        ),
      remove: ({ params }) =>
        asMember(
          params.workspaceId,
          ConnectionService.ConnectionService.use((connectionService) =>
            connectionService.remove(params.connectionId),
          ),
        ),
    });
  }),
);
