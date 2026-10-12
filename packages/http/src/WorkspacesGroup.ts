/**
 * The `workspaces` endpoint group: creating a workspace, its settings, and its ownership. `create`
 * goes through the gateway's `createWorkspace` for the authenticated person, who needs no
 * membership; any entitlement check is the host's. The other endpoints need active membership and
 * call `WorkspaceSettingsService` (`get`, `rename`, `members`) and `OwnershipService` (`get`,
 * `transfer`); transferring ownership needs the current human owner. An agent gets
 * `ApiErrors.Denied` from `create` and `transferOwnership`. `WorkspacesHandlers` implements
 * it.
 *
 * @since 0.1.0
 */
import { Ownership, Workspace, WorkspaceSettings } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import { WorkspaceMember } from "./WorkspaceMember.ts";
import * as ApiErrors from "./ApiErrors.ts";

/**
 * Workspace creation, settings and renaming, the member-management view, and ownership. Creation
 * entitlement checks belong to the host.
 *
 * @category models
 * @since 0.1.0
 */
export class WorkspacesGroup extends HttpApiGroup.make("workspaces")
  .add(
    HttpApiEndpoint.get("settings", "/:workspaceId/settings", {
      params: { workspaceId: Workspace.Id },
      success: WorkspaceSettings.View,
      error: [...ApiErrors.workspace, ...ApiErrors.delegation],
    }).middleware(WorkspaceMember),
    HttpApiEndpoint.put("rename", "/:workspaceId/name", {
      params: { workspaceId: Workspace.Id },
      payload: WorkspaceSettings.RenameInput,
      success: Workspace.Workspace,
      error: [...ApiErrors.workspace, ApiErrors.Changed],
    }).middleware(WorkspaceMember),
    HttpApiEndpoint.get("members", "/:workspaceId/member-management", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(WorkspaceSettings.MemberEntry),
      error: [...ApiErrors.workspace, ...ApiErrors.delegation],
    }).middleware(WorkspaceMember),
    HttpApiEndpoint.post("create", "/", {
      headers: ApiErrors.requestKey,
      payload: Workspace.CreateInput,
      success: Workspace.Workspace.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedWorkspace",
      }),
      error: [ApiErrors.Denied, ApiErrors.Unavailable, ApiErrors.Uncertain, ApiErrors.Invalid],
    }),
    HttpApiEndpoint.get("ownership", "/:workspaceId/ownership", {
      params: { workspaceId: Workspace.Id },
      success: Ownership.View,
      error: [...ApiErrors.workspace, ...ApiErrors.ownership, ...ApiErrors.delegation],
    }).middleware(WorkspaceMember),
    HttpApiEndpoint.post("transferOwnership", "/:workspaceId/ownership", {
      params: { workspaceId: Workspace.Id },
      payload: Ownership.TransferInput,
      success: Workspace.Workspace,
      error: [...ApiErrors.workspace, ...ApiErrors.ownership, ...ApiErrors.delegation],
    }).middleware(WorkspaceMember),
  )
  .middleware(Authentication)
  .prefix("/workspaces") {}
