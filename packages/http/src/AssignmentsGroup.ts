/**
 * The `assignments` endpoint group: the roles that give a member permissions, and what the caller
 * may do. Its endpoints call `AssignmentService`: `permissions`, `roles`, `list`, `assign`,
 * `change`, and `revoke`. Any active member reads their own permissions and the built-in roles to
 * choose from; reading another member's access needs `assignment.read` on them, and giving,
 * replacing, or taking away a role follows the delegation rules. `AssignmentsHandlers` implements
 * it.
 *
 * @since 0.1.0
 */
import { Assignment, Permission } from "@amends-dev/core/authorization";
import { Member, Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import * as ApiErrors from "./ApiErrors.ts";

const params = { workspaceId: Workspace.Id };
const member = { ...params, memberId: Member.Id };
const error = [...ApiErrors.member, ...ApiErrors.assignment];

/**
 * A member's access: the caller's own workspace-wide permissions, the built-in roles to choose
 * from, one member's assignments, and adding a role, replacing the workspace roles as a whole
 * against the assignments expected, and revoking one.
 *
 * @category models
 * @since 0.1.0
 */
export class AssignmentsGroup extends HttpApiGroup.make("assignments")
  .add(
    HttpApiEndpoint.get("permissions", "/permissions", {
      params,
      success: Schema.Array(Permission.Name),
      error: ApiErrors.member,
    }),
    HttpApiEndpoint.get("roles", "/roles", {
      params,
      success: Schema.Array(Assignment.RoleChoice),
      error,
    }),
    HttpApiEndpoint.get("list", "/members/:memberId/assignments", {
      params: member,
      success: Assignment.Access,
      error,
    }),
    HttpApiEndpoint.post("assign", "/assignments", {
      params,
      payload: Assignment.AssignInput,
      success: Assignment.Assignment,
      error,
    }),
    HttpApiEndpoint.put("change", "/assignments", {
      params,
      payload: Assignment.ChangeInput,
      success: Assignment.Assignment,
      error,
    }),
    HttpApiEndpoint.delete("revoke", "/members/:memberId/assignments/:assignmentId", {
      params: { ...member, assignmentId: Assignment.Id },
      success: Assignment.Assignment,
      error,
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId") {}
