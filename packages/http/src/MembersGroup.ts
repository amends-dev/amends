/**
 * The `members` endpoint group: a workspace's memberships. Its endpoints call `MemberService`:
 * `list`, `get`, `rename`, and `remove`. Every endpoint needs active membership; core lists and
 * reads only the members `member.read` lets the caller see, the caller renames only their own
 * membership, and removing a member follows the delegation rules and never reaches the owner.
 * `MembersHandlers` implements it.
 *
 * @since 0.1.0
 */

import { Member, MemberId } from "@amends-dev/core/workspace"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as Schema from "effect/Schema"
import * as ApiErrors from "./ApiErrors.ts"
import * as Authentication from "./Authentication.ts"
import * as WorkspaceMember from "./WorkspaceMember.ts"

const params = { memberId: MemberId.MemberId }

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
      payload: Schema.Struct({ name: Member.NewName }),
      success: Member.Member,
      error: [...ApiErrors.workspace, ApiErrors.NotFound]
    }),
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Member.Member),
      error: [...ApiErrors.workspace, ApiErrors.NotFound]
    }),
    HttpApiEndpoint.get("get", "/:memberId", {
      params,
      success: Member.Member,
      error: [...ApiErrors.workspace, ApiErrors.NotFound]
    }),
    HttpApiEndpoint.delete("remove", "/:memberId", {
      params,
      success: Member.Member,
      error: [...ApiErrors.workspace, ApiErrors.Conflict, ApiErrors.Conflict, ...ApiErrors.delegation]
    })
  )
  .middleware(WorkspaceMember.WorkspaceMember)
  .middleware(Authentication.Authentication)
  .prefix("/members") {}
