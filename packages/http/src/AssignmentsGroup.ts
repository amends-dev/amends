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
import { Member } from "@amends-dev/core/workspace";
import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import { Authentication } from "./Authentication.ts";
import { WorkspaceMember } from "./WorkspaceMember.ts";
import * as ApiErrors from "./ApiErrors.ts";

const member = { memberId: Member.Id };
const error = [...ApiErrors.workspace, ...ApiErrors.assignment];

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
      success: Schema.Array(Permission.Name),
      error: ApiErrors.workspace,
    }),
    HttpApiEndpoint.get("roles", "/roles", {
      success: Schema.Array(Assignment.RoleChoice),
      error: [...ApiErrors.workspace, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.get("list", "/members/:memberId/assignments", {
      params: member,
      success: Assignment.Access,
      error: [...ApiErrors.workspace, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.post("assign", "/assignments", {
      payload: Assignment.AssignInput,
      success: Assignment.Assignment,
      error,
    }),
    HttpApiEndpoint.put("change", "/assignments", {
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
  .middleware(WorkspaceMember)
  .middleware(Authentication) {}
