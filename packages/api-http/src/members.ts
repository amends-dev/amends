import { Member, Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import * as Errors from "./errors.ts";

const params = { workspaceId: Workspace.Id, memberId: Member.Id };

/** Membership reads and removal, authorized by core for the principal's membership. */
export class MembersGroup extends HttpApiGroup.make("members")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(Member.Record),
      error: [...Errors.member, Errors.MemberNotFound],
    }),
    HttpApiEndpoint.get("get", "/:memberId", {
      params,
      success: Member.Record,
      error: [...Errors.member, Errors.MemberNotFound],
    }),
    HttpApiEndpoint.delete("remove", "/:memberId", {
      params,
      success: Member.Record,
      error: [
        ...Errors.member,
        Errors.MemberNotFound,
        Errors.OwnerProtected,
        Errors.AlreadyRemoved,
      ],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/members") {}
