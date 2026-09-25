import { Ownership, Workspace, WorkspaceSettings } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

/** Workspace creation and ownership operations. Creation entitlement checks belong to the host. */
export class WorkspacesGroup extends HttpApiGroup.make("workspaces")
  .add(
    HttpApiEndpoint.get("settings", "/:workspaceId/settings", {
      params: { workspaceId: Workspace.Id },
      success: WorkspaceSettings.View,
      error: [
        ...ApiErrors.member,
        ...ApiErrors.assignment,
        ApiErrors.MemberNotFound,
        ApiErrors.OwnerProtected,
        ApiErrors.AlreadyRemoved,
        ApiErrors.WorkspaceChanged,
      ],
    }),
    HttpApiEndpoint.put("rename", "/:workspaceId/name", {
      params: { workspaceId: Workspace.Id },
      payload: WorkspaceSettings.RenameInput,
      success: Workspace.Record,
      error: [
        ...ApiErrors.member,
        ...ApiErrors.assignment,
        ApiErrors.MemberNotFound,
        ApiErrors.OwnerProtected,
        ApiErrors.AlreadyRemoved,
        ApiErrors.WorkspaceChanged,
      ],
    }),
    HttpApiEndpoint.get("members", "/:workspaceId/member-management", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(WorkspaceSettings.MemberEntry),
      error: [
        ...ApiErrors.member,
        ...ApiErrors.assignment,
        ApiErrors.MemberNotFound,
        ApiErrors.OwnerProtected,
        ApiErrors.AlreadyRemoved,
        ApiErrors.WorkspaceChanged,
      ],
    }),
    HttpApiEndpoint.post("create", "/", {
      headers: ApiErrors.requestKey,
      payload: Workspace.CreateInput,
      success: Workspace.Record.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedWorkspace",
      }),
      error: [
        ApiErrors.HumanRequired,
        ApiErrors.Conflict,
        ApiErrors.Uncertain,
        ApiErrors.InvalidInput,
        ApiErrors.RequestReused,
      ],
    }),
    HttpApiEndpoint.get("ownership", "/:workspaceId/ownership", {
      params: { workspaceId: Workspace.Id },
      success: Ownership.View,
      error: [...ApiErrors.member, ...ApiErrors.ownership, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.post("transferOwnership", "/:workspaceId/ownership", {
      params: { workspaceId: Workspace.Id },
      payload: Ownership.TransferInput,
      success: Workspace.Record,
      error: [
        ApiErrors.HumanRequired,
        ...ApiErrors.member,
        ...ApiErrors.ownership,
        ...ApiErrors.delegation,
      ],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces") {}
