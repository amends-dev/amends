import { WorkspaceDirectory } from "@amends/gateway/directory";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";

/** What the authenticated identity can reach across workspaces. */
export class MeGroup extends HttpApiGroup.make("me")
  .add(HttpApiEndpoint.get("workspaces", "/workspaces", { success: WorkspaceDirectory.Listing }))
  .middleware(Authentication)
  .prefix("/me") {}
