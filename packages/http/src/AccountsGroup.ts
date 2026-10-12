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
import { Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
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
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(Accounts.Account),
      error: [...ApiErrors.member, ...ApiErrors.invitation],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/accounts") {}
