/**
 * Implements `SettingsGroup`. Each handler calls `WorkspaceSettingsService` or `OwnershipService` in
 * the workspace `WorkspaceMember` entered as the principal's membership; transferring ownership
 * refuses an agent with `HumanRequired`.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { OwnershipService, WorkspaceSettingsService } from "@amends-dev/core/workspace";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { requireHuman } from "./internal/human.ts";

/**
 * Register the settings handlers: settings and renaming, member management, and ownership.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(Api.Api, "settings", (handlers) =>
  handlers.handleAll({
    get: () =>
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
      Effect.andThen(
        requireHuman,
        OwnershipService.OwnershipService.use((ownershipService) =>
          ownershipService.transfer(payload),
        ),
      ),
  }),
);
