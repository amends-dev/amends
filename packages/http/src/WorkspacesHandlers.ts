/**
 * Implements `WorkspacesGroup`. Creating a workspace refuses an agent with
 * `HumanRequired` and calls the gateway's `createWorkspace` for the person, with no
 * membership to enter. The other handlers enter the workspace as the principal's membership through
 * `Gateway.asMember` and call `WorkspaceSettingsService` or `OwnershipService`; transferring
 * ownership refuses an agent first.
 *
 * @since 0.1.0
 */
import { Identity } from "@amends-dev/core/identity";
import * as Api from "./Api.ts";
import * as Authentication from "./Authentication.ts";
import { makeAsMember } from "./internal/as-member.ts";
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
    const asMember = yield* makeAsMember;
    const gateway = yield* Gateway.Gateway;
    return handlers.handleAll({
      settings: ({ params }) =>
        asMember(
          params.workspaceId,
          WorkspaceSettingsService.WorkspaceSettingsService.use(
            (workspaceSettingsService) => workspaceSettingsService.get,
          ),
        ),
      members: ({ params }) =>
        asMember(
          params.workspaceId,
          WorkspaceSettingsService.WorkspaceSettingsService.use(
            (workspaceSettingsService) => workspaceSettingsService.members,
          ),
        ),
      rename: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          WorkspaceSettingsService.WorkspaceSettingsService.use((workspaceSettingsService) =>
            workspaceSettingsService.rename(payload),
          ),
        ),
      ownership: ({ params }) =>
        asMember(
          params.workspaceId,
          OwnershipService.OwnershipService.use((ownershipService) => ownershipService.get),
        ),
      transferOwnership: ({ params, payload }) =>
        Effect.gen(function* () {
          const principal = yield* Authentication.Principal;
          if (!Identity.MemberReference.isAnyOf(["Human"])(principal))
            return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() });
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
