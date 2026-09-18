import { Workspace } from "@amends/core/workspace";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import * as Errors from "./errors.ts";

/** Workspace creation for the authenticated human. Entitlement checks belong to the host. */
export class WorkspacesGroup extends HttpApiGroup.make("workspaces")
  .add(
    HttpApiEndpoint.post("create", "/", {
      success: Workspace.Record.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedWorkspace",
      }),
      error: [Errors.HumanRequired, Errors.Conflict, Errors.Uncertain, Errors.InvalidInput],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces") {}
