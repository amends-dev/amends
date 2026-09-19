import { Ownership, Workspace } from "@amends/core/workspace";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

/** Workspace creation and ownership operations. Creation entitlement checks belong to the host. */
export class WorkspacesGroup extends HttpApiGroup.make("workspaces")
  .add(
    HttpApiEndpoint.post("create", "/", {
      payload: Workspace.CreateInput,
      success: Workspace.Record.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedWorkspace",
      }),
      error: [
        ApiErrors.HumanRequired,
        ApiErrors.Conflict,
        ApiErrors.Uncertain,
        ApiErrors.InvalidInput,
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
