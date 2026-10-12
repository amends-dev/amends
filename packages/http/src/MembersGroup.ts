/**
 * The `members` endpoint group: a workspace's memberships. Its endpoints call `MemberService`:
 * `list`, `get`, `rename`, and `remove`. Every endpoint needs active membership; core lists and
 * reads only the members `member.read` lets the caller see, the caller renames only their own
 * membership, and removing a member follows the delegation rules and never reaches the owner.
 * `MembersHandlers` implements it.
 *
 * @since 0.1.0
 */
import { Member, Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import * as ApiErrors from "./ApiErrors.ts";

const params = { workspaceId: Workspace.Id, memberId: Member.Id };

/**
 * Membership reads and removal, authorized by core for the principal's membership, and the
 * caller choosing what people in the workspace call them.
 *
 * @category models
 * @since 0.1.0
 */
export class MembersGroup extends HttpApiGroup.make("members")
  .add(
    HttpApiEndpoint.put("rename", "/me/name", {
      params: { workspaceId: Workspace.Id },
      payload: Schema.Struct({ name: Member.NewName }),
      success: Member.Member,
      error: [...ApiErrors.member, ApiErrors.NotFound],
    }),
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(Member.Member),
      error: [...ApiErrors.member, ApiErrors.NotFound],
    }),
    HttpApiEndpoint.get("get", "/:memberId", {
      params,
      success: Member.Member,
      error: [...ApiErrors.member, ApiErrors.NotFound],
    }),
    HttpApiEndpoint.delete("remove", "/:memberId", {
      params,
      success: Member.Member,
      error: [
        ...ApiErrors.member,
        ApiErrors.OwnerProtected,
        ApiErrors.AlreadyRemoved,
        ...ApiErrors.delegation,
      ],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/members") {}
