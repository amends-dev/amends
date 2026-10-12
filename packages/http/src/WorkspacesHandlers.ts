/**
 * Implements `WorkspacesGroup`. Creating a workspace refuses an agent with `HumanRequired` and
 * calls the gateway's `createWorkspace` for the person, with no membership to enter. The other
 * handlers call `WorkspaceSettingsService` or `OwnershipService` in the workspace `WorkspaceMember`
 * entered as the principal's membership; transferring ownership refuses an agent.
 *
 * @since 0.1.0
 */
import { Identity } from "@amends-dev/core/identity";
import * as Api from "./Api.ts";
import * as Authentication from "./Authentication.ts";
import { Gateway } from "@amends-dev/gateway";
import { OwnershipService, WorkspaceSettingsService } from "@amends-dev/core/workspace";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { CoreError } from "@amends-dev/core/error";

/**
 * Register the workspace handlers: creation, settings and renaming, member management, and
 * ownership, reading the principal per request.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "workspaces",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    return handlers.handleAll({
      settings: () =>
        WorkspaceSettingsService.WorkspaceSettingsService.use(
          (workspaceSettingsService) => workspaceSettingsService.get,
        ),
      members: () =>
        WorkspaceSettingsService.WorkspaceSettingsService.use(
          (workspaceSettingsService) => workspaceSettingsService.members,
        ),
      rename: ({ payload }) =>
        WorkspaceSettingsService.WorkspaceSettingsService.use((workspaceSettingsService) =>
          workspaceSettingsService.rename(payload),
        ),
      ownership: () =>
        OwnershipService.OwnershipService.use((ownershipService) => ownershipService.get),
      transferOwnership: ({ payload }) =>
        Effect.gen(function* () {
          const principal = yield* Authentication.Principal;
          if (!Identity.MemberReference.isAnyOf(["Human"])(principal))
            return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() });
          return yield* OwnershipService.OwnershipService.use((ownershipService) =>
            ownershipService.transfer(payload),
          );
        }),
      create: ({ headers, payload }) =>
        Effect.gen(function* () {
          const principal = yield* Authentication.Principal;
          if (!Identity.MemberReference.isAnyOf(["Human"])(principal))
            return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() });
          return yield* gateway.createWorkspace(principal.id, payload, {
            requestKey: headers["idempotency-key"],
          });
        }),
    });
  }),
);
