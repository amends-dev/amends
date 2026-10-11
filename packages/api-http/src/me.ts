import * as Accounts from "@amends-dev/gateway/accounts";
import * as WorkspaceDirectory from "@amends-dev/gateway/directory";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication, Unauthorized } from "./authentication.ts";
import * as ApiErrors from "./errors.ts";

/**
 * The authenticated identity: who they are, what they can reach across workspaces, and signing
 * out. Only a person has an account; a session no account holds is not honored.
 */
export class MeGroup extends HttpApiGroup.make("me")
  .add(
    HttpApiEndpoint.get("account", "/", {
      success: Accounts.Account,
      error: [ApiErrors.HumanRequired, Unauthorized],
    }),
    HttpApiEndpoint.get("workspaces", "/workspaces", { success: WorkspaceDirectory.Listing }),
    HttpApiEndpoint.delete("signOut", "/session", { success: HttpApiSchema.NoContent }),
  )
  .middleware(Authentication)
  .prefix("/me") {}
