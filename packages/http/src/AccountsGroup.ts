/**
 * The `accounts` endpoint group: the accounts behind a workspace's people, so settings can show
 * addresses beside names. Its one endpoint lists the workspace's invitations through
 * `InvitationService.list`, which authorizes the read, then its members through
 * `MemberService.list`, and resolves their human IDs through the host's `Accounts.findByIds`; only
 * someone who may manage invitations, which go to an address, may call it. `AccountsHandlers`
 * implements it.
 *
 * @since 0.1.0
 */
import * as Accounts from "@amends-dev/gateway/Accounts";
import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as Authentication from "./Authentication.ts";
import * as WorkspaceMember from "./WorkspaceMember.ts";
import * as ApiErrors from "./ApiErrors.ts";

/**
 * The accounts behind a workspace's people: its human members and the recipients of its
 * invitations. Only someone who manages invitations, which go to an address, may read them.
 *
 * @category models
 * @since 0.1.0
 */
export class AccountsGroup extends HttpApiGroup.make("accounts")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Accounts.Account),
      error: [...ApiErrors.workspace, ...ApiErrors.delegation],
    }),
  )
  .middleware(WorkspaceMember.WorkspaceMember)
  .middleware(Authentication.Authentication)
  .prefix("/accounts") {}
