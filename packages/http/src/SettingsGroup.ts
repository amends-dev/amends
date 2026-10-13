/**
 * The `settings` endpoint group: the workspace a member's request names, as its settings show it,
 * with its member-management view and its ownership. Every endpoint needs active membership and
 * calls `WorkspaceSettingsService` (`get`, `rename`, `members`) or `OwnershipService` (`get`,
 * `transfer`); transferring ownership needs the current human owner, and an agent gets
 * `ApiErrors.Denied` from it. `SettingsHandlers` implements it.
 *
 * @since 0.1.0
 */
import { Ownership, Workspace, WorkspaceSettings } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import { WorkspaceMember } from "./WorkspaceMember.ts";
import * as ApiErrors from "./ApiErrors.ts";

/**
 * The workspace's settings and renaming, the member-management view, and ownership.
 *
 * @category models
 * @since 0.1.0
 */
export class SettingsGroup extends HttpApiGroup.make("settings")
  .add(
    HttpApiEndpoint.get("get", "/", {
      success: WorkspaceSettings.View,
      error: [...ApiErrors.workspace, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.put("rename", "/name", {
      payload: WorkspaceSettings.RenameInput,
      success: Workspace.Workspace,
      error: [...ApiErrors.workspace, ApiErrors.Changed],
    }),
    HttpApiEndpoint.get("members", "/members", {
      success: Schema.Array(WorkspaceSettings.MemberEntry),
      error: [...ApiErrors.workspace, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.get("ownership", "/ownership", {
      success: Ownership.View,
      error: [...ApiErrors.workspace, ...ApiErrors.ownership, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.post("transferOwnership", "/ownership", {
      payload: Ownership.TransferInput,
      success: Workspace.Workspace,
      error: [...ApiErrors.workspace, ...ApiErrors.ownership, ...ApiErrors.delegation],
    }),
  )
  .middleware(WorkspaceMember)
  .middleware(Authentication)
  .prefix("/settings") {}
