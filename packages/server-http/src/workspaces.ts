import { Api, ApiErrors, Principal } from "@amends/api-http";
import { Gateway } from "@amends/gateway";
import { OwnershipApplication, WorkspaceSettingsApplication } from "@amends/core/workspace";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register workspace creation and ownership operations over authenticated gateway entry.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "workspaces",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      settings: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              WorkspaceSettingsApplication.Service,
              (workspaceSettingsApplication) => workspaceSettingsApplication.get,
            ),
          ),
        ),
      members: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              WorkspaceSettingsApplication.Service,
              (workspaceSettingsApplication) => workspaceSettingsApplication.members,
            ),
          ),
        ),
      rename: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(WorkspaceSettingsApplication.Service, (workspaceSettingsApplication) =>
              workspaceSettingsApplication.rename(payload),
            ),
          ),
        ),
      ownership: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              OwnershipApplication.Service,
              (ownershipApplication) => ownershipApplication.get,
            ),
          ),
        ),
      transferOwnership: ({ params, payload }) =>
        Effect.gen(function* () {
          const principal = yield* Principal;
          if (principal._tag !== "Human") return yield* new ApiErrors.HumanRequired();
          return yield* gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(OwnershipApplication.Service, (ownershipApplication) =>
              ownershipApplication.transfer(payload),
            ),
          );
        }),
      create: ({ headers, payload }) =>
        Effect.gen(function* () {
          const principal = yield* Principal;
          if (principal._tag !== "Human") return yield* new ApiErrors.HumanRequired();
          return yield* gateway.createWorkspace(principal.id, payload, {
            requestKey: headers["idempotency-key"],
          });
        }),
    });
  }),
);

export * as WorkspacesHandlers from "./workspaces.ts";
