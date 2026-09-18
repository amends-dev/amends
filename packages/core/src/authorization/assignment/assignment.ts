import { Schema } from "effect";
import { Member } from "../../workspace/member/member.ts";
import { Workspace } from "../../workspace/workspace.ts";
import { Grant } from "../grant.ts";
import { Role } from "../role/role.ts";
import { Scope } from "../scope.ts";

/** Identifies one assignment; assigning access again after revocation uses a fresh ID. */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceAssignmentId"));
export type Id = typeof Id.Type;

export const Status = Schema.Literals(["active", "revoked"]);
export type Status = typeof Status.Type;

/** Role assignments resolve the role's current permissions at the assigned scope. */
export const Source = Schema.TaggedUnion({
  Role: { roleId: Role.Id, scope: Scope.Value },
  Direct: { grant: Grant.Value },
});
export type Source = typeof Source.Type;

/** Shared workspace constraint for assignment records and creation facts. */
export const SourceInWorkspace = Schema.makeFilter(
  ({ workspaceId, source }: { readonly workspaceId: Workspace.Id; readonly source: Source }) => {
    const scope = Source.match(source, {
      Role: ({ scope }) => scope,
      Direct: ({ grant }) => grant.scope,
    });
    const scopeWorkspaceId = Scope.Value.match(scope, {
      Workspace: ({ workspaceId }) => workspaceId,
      Target: ({ target }) => target.workspaceId,
    });
    return scopeWorkspaceId === workspaceId
      ? undefined
      : { path: ["source"], issue: "Assignment scope must belong to its workspace" };
  },
);

/**
 * Access assigned to one workspace membership. Revoked records retain their source.
 * This schema validates scope/workspace consistency. Membership, role ownership,
 * permission compatibility, and grant authority require application-level validation.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: Workspace.Id,
  memberId: Member.Id,
  source: Source,
  status: Status,
}).check(SourceInWorkspace);
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Assignment from "./assignment.ts";
