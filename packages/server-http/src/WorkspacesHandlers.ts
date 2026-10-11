/**
 * Implements `WorkspacesGroup`. Creating a workspace refuses an agent with
 * `ApiErrors.HumanRequired` and calls the gateway's `createWorkspace` for the person, with no
 * membership to enter. The other handlers enter the workspace as the principal's membership through
 * `Gateway.asMember` and call `WorkspaceSettingsService` or `OwnershipService`; transferring
 * ownership refuses an agent first.
 *
 * @since 0.1.0
 */
import { Identity } from "@amends-dev/core/identity";
import { Api, ApiErrors, Principal } from "@amends-dev/api-http";
import { Gateway } from "@amends-dev/gateway";
import { OwnershipService, WorkspaceSettingsService } from "@amends-dev/core/workspace";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the workspace handlers: creation, settings and renaming, member management, and
 * ownership, reading the principal per request.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api,
  "workspaces",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    return handlers.handleAll({
      settings: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              WorkspaceSettingsService.WorkspaceSettingsService,
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
              WorkspaceSettingsService.WorkspaceSettingsService,
              (workspaceSettingsService) => workspaceSettingsService.members,
            ),
          ),
        ),
      rename: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              WorkspaceSettingsService.WorkspaceSettingsService,
              (workspaceSettingsService) => workspaceSettingsService.rename(payload),
            ),
          ),
        ),
      ownership: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              OwnershipService.OwnershipService,
              (ownershipService) => ownershipService.get,
            ),
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
            Effect.flatMap(OwnershipService.OwnershipService, (ownershipService) =>
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
