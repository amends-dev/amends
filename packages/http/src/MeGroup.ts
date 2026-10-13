/**
 * The `me` endpoint group: the authenticated identity itself, across workspaces. `account` reads
 * the principal's account through the host's `Accounts.findByIds`, `workspaces` lists its
 * memberships and pending invitations through `WorkspaceDirectory.list`, and `signOut` revokes the
 * presented `Credential` through `SessionTokens.revoke`. Any authenticated principal may call them,
 * except that only a person has an account: an agent gets `ApiErrors.Denied`, and a session
 * no account holds `Unauthorized`. `MeHandlers` implements it.
 *
 * @since 0.1.0
 */
import * as Accounts from "@amends-dev/gateway/Accounts";
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpApiSchema from "effect/http-api/HttpApiSchema";
import * as Authentication from "./Authentication.ts";
import * as ApiErrors from "./ApiErrors.ts";

/**
 * The authenticated identity: who they are, what they can reach across workspaces, and signing
 * out. Only a person has an account; a session no account holds is not honored.
 *
 * @category models
 * @since 0.1.0
 */
export class MeGroup extends HttpApiGroup.make("me")
  .add(
    HttpApiEndpoint.get("account", "/", {
      success: Accounts.Account,
      error: [ApiErrors.Denied, Authentication.Unauthorized],
    }),
    HttpApiEndpoint.get("workspaces", "/workspaces", { success: WorkspaceDirectory.Listing }),
    HttpApiEndpoint.delete("signOut", "/session", { success: HttpApiSchema.NoContent }),
  )
  .middleware(Authentication.Authentication)
  .prefix("/me") {}
