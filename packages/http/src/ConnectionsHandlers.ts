/**
 * Implements `ConnectionsGroup`. Each handler runs in the workspace `WorkspaceMember` entered as
 * the principal's membership, and calls one `ConnectionService` operation, merging the path's
 * connection ID, the body, and the `Idempotency-Key` header into its input. `Routes` composes its
 * `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { ConnectionService } from "@amends-dev/core/connection";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

/**
 * Register the handlers of connections, each entering the workspace
 * as the request\'s principal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(Api.Api, "connections", (handlers) =>
  handlers.handleAll({
    integrations: () =>
      ConnectionService.ConnectionService.use(
        (connectionService) => connectionService.integrations,
      ),
    list: () =>
      ConnectionService.ConnectionService.use((connectionService) => connectionService.list),
    create: ({ headers, payload }) =>
      ConnectionService.ConnectionService.use((connectionService) =>
        connectionService.create(payload, { requestKey: headers["idempotency-key"] }),
      ),
    get: ({ params }) =>
      ConnectionService.ConnectionService.use((connectionService) =>
        connectionService.get(params.connectionId),
      ),
    models: ({ params }) =>
      ConnectionService.ConnectionService.use((connectionService) =>
        connectionService.models(params.connectionId),
      ),
    rename: ({ params, payload }) =>
      ConnectionService.ConnectionService.use((connectionService) =>
        connectionService.rename({
          connectionId: params.connectionId,
          name: payload.name,
          expectedName: payload.expectedName,
        }),
      ),
    configure: ({ params, payload }) =>
      ConnectionService.ConnectionService.use((connectionService) =>
        connectionService.configure({
          connectionId: params.connectionId,
          settings: payload.settings,
        }),
      ),
    replaceKey: ({ params, payload }) =>
      ConnectionService.ConnectionService.use((connectionService) =>
        connectionService.replaceKey({
          connectionId: params.connectionId,
          apiKey: payload.apiKey,
        }),
      ),
    check: ({ params }) =>
      ConnectionService.ConnectionService.use((connectionService) =>
        connectionService.check(params.connectionId),
      ),
    remove: ({ params }) =>
      ConnectionService.ConnectionService.use((connectionService) =>
        connectionService.remove(params.connectionId),
      ),
  }),
);
