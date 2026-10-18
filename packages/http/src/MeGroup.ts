/**
 * The `me` endpoint group: the authenticated identity itself, across workspaces. `account` reads
 * the principal's account through the host's `Accounts.findByIds`, `workspaces` lists its
 * memberships and pending invitations through `WorkspaceDirectory.list`, `signOut` revokes the
 * presented `Credential` through `SessionTokens.revoke`, and `registerSyncKey` and `removeSyncKey`
 * register and remove the key of their browser's eventlog identity, which opens their stores to the
 * sync server, through `SyncStorage`. Any authenticated principal may call
 * them, except that only a person has an account or syncs: an agent gets `ApiErrors.Denied`, and a
 * session no account holds `Unauthorized`. `MeHandlers` implements it.
 *
 * @since 0.1.0
 */

import * as Accounts from "@amends-dev/gateway/Accounts"
import * as SyncStorage from "@amends-dev/gateway/SyncStorage"
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiSchema from "effect/http-api/HttpApiSchema"
import * as ApiErrors from "./ApiErrors.ts"
import * as Authentication from "./Authentication.ts"

const syncKey = { publicKey: SyncStorage.PublicKey }

/**
 * The authenticated identity: who they are, what they can reach across workspaces, signing out,
 * and the keys their browsers sync with. Only a person has an account or syncs; a session no
 * account holds is not honored.
 *
 * @category models
 * @since 0.1.0
 */
export class MeGroup extends HttpApiGroup.make("me")
  .add(
    HttpApiEndpoint.get("account", "/", {
      success: Accounts.Account,
      error: [ApiErrors.Denied, Authentication.Unauthorized]
    }),
    HttpApiEndpoint.get("workspaces", "/workspaces", { success: WorkspaceDirectory.Listing }),
    HttpApiEndpoint.delete("signOut", "/session", { success: HttpApiSchema.NoContent }),
    HttpApiEndpoint.put("registerSyncKey", "/sync-keys/:publicKey", {
      params: syncKey,
      success: HttpApiSchema.NoContent,
      error: [ApiErrors.Denied, SyncStorage.KeyTaken.pipe(HttpApiSchema.status(409))]
    }),
    HttpApiEndpoint.delete("removeSyncKey", "/sync-keys/:publicKey", {
      params: syncKey,
      success: HttpApiSchema.NoContent,
      error: ApiErrors.Denied
    })
  )
  .middleware(Authentication.Authentication)
  .prefix("/me") {}
