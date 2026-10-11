import * as Accounts from "@amends-dev/gateway/Accounts";
import { Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import * as ApiErrors from "./ApiErrors.ts";

/**
 * The accounts behind a workspace's people: its human members and the recipients of its
 * invitations. Only someone who manages invitations, which go to an address, may read them.
 */
export class AccountsGroup extends HttpApiGroup.make("accounts")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(Accounts.Account),
      error: [...ApiErrors.member, ApiErrors.MemberNotFound, ...ApiErrors.invitation],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/accounts") {}
