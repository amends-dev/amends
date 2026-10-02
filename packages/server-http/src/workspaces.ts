import { Identity } from "@amends/core/identity";
import { Api, ApiErrors, Principal } from "@amends/api-http";
import { Gateway } from "@amends/gateway";
import { OwnershipService, WorkspaceSettingsService } from "@amends/core/workspace";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

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
              WorkspaceSettingsService.Service,
              (workspaceSettingsService) => workspaceSettingsService.get,
            ),
          ),
        ),
      members: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              WorkspaceSettingsService.Service,
              (workspaceSettingsService) => workspaceSettingsService.members,
            ),
          ),
        ),
      rename: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(WorkspaceSettingsService.Service, (workspaceSettingsService) =>
              workspaceSettingsService.rename(payload),
            ),
          ),
        ),
      ownership: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(OwnershipService.Service, (ownershipService) => ownershipService.get),
          ),
        ),
      transferOwnership: ({ params, payload }) =>
        Effect.gen(function* () {
          const principal = yield* Principal;
          if (!Identity.MemberReference.isAnyOf(["Human"])(principal))
            return yield* new ApiErrors.HumanRequired();
          return yield* gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(OwnershipService.Service, (ownershipService) =>
              ownershipService.transfer(payload),
            ),
          );
        }),
      create: ({ headers, payload }) =>
        Effect.gen(function* () {
          const principal = yield* Principal;
          if (!Identity.MemberReference.isAnyOf(["Human"])(principal))
            return yield* new ApiErrors.HumanRequired();
          return yield* gateway.createWorkspace(principal.id, payload, {
            requestKey: headers["idempotency-key"],
          });
        }),
    });
  }),
);

export * as WorkspacesHandlers from "./workspaces.ts";
