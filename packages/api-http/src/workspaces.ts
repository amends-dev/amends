import { Workspace } from "@amends/core/workspace";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

/** Workspace creation for the authenticated human. Entitlement checks belong to the host. */
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
  )
  .middleware(Authentication)
  .prefix("/workspaces") {}
