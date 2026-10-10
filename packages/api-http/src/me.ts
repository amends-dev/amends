import { WorkspaceDirectory } from "@amends-dev/gateway/directory";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { Authentication } from "./authentication.ts";

/** What the authenticated identity can reach across workspaces. */
export class MeGroup extends HttpApiGroup.make("me")
  .add(HttpApiEndpoint.get("workspaces", "/workspaces", { success: WorkspaceDirectory.Listing }))
  .middleware(Authentication)
  .prefix("/me") {}
