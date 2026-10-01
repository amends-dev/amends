import { Api, Principal } from "@amends/api-http";
import { EnvironmentService } from "@amends/core/environment";
import type { Actor } from "@amends/core/identity";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register environment handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "environments",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    /** Run an environment operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (
        environmentService: EnvironmentService.Interface,
      ) => Effect.Effect<A, E, Actor.Service>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(
          workspaceId,
          principal,
          Effect.flatMap(EnvironmentService.Service, operation),
        ),
      );
    return handlers.handleAll({
      implementations: ({ params }) =>
        asMember(params.workspaceId, (environmentService) =>
          Effect.succeed(environmentService.implementations),
        ),
      list: ({ params }) =>
        asMember(params.workspaceId, (environmentService) => environmentService.list),
      create: ({ params, headers, payload }) =>
        asMember(params.workspaceId, (environmentService) =>
          environmentService.create(payload, { requestKey: headers["idempotency-key"] }),
        ),
      get: ({ params }) =>
        asMember(params.workspaceId, (environmentService) =>
          environmentService.get(params.environmentId),
        ),
      rename: ({ params, payload }) =>
        asMember(params.workspaceId, (environmentService) =>
          environmentService.rename({
            environmentId: params.environmentId,
            name: payload.name,
            expectedName: payload.expectedName,
          }),
        ),
      configure: ({ params, payload }) =>
        asMember(params.workspaceId, (environmentService) =>
          environmentService.configure({
            environmentId: params.environmentId,
            sandbox: payload.sandbox,
          }),
        ),
      remove: ({ params }) =>
        asMember(params.workspaceId, (environmentService) =>
          environmentService.remove(params.environmentId),
        ),
    });
  }),
);

export * as EnvironmentsHandlers from "./environments.ts";
