import { Assignment, Permission } from "@amends-dev/core/authorization";
import { Member, Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const params = { workspaceId: Workspace.Id };
const member = { ...params, memberId: Member.Id };
const error = [...ApiErrors.member, ...ApiErrors.assignment];

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
      success: Assignment.Record,
      error,
    }),
    HttpApiEndpoint.put("change", "/assignments", {
      params,
      payload: Assignment.ChangeInput,
      success: Assignment.Record,
      error,
    }),
    HttpApiEndpoint.delete("revoke", "/members/:memberId/assignments/:assignmentId", {
      params: { ...member, assignmentId: Assignment.Id },
      success: Assignment.Record,
      error,
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId") {}
