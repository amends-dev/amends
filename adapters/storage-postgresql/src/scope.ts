import type { Scope } from "@amends/core/authorization";
import type { Workspace } from "@amends/core/workspace";
import type { scopeKinds, targetKinds } from "./schema.ts";

/** The three scope columns shared by assignments and invitation grants. */
export interface Columns {
  readonly scopeKind: (typeof scopeKinds)[number];
  readonly targetKind: (typeof targetKinds)[number] | null;
  readonly targetMemberId: string | null;
}

/** The scope's workspace is the row's, so only the shape and target survive. */
export const encode = (scope: Scope.Value): Columns => {
  if (scope._tag === "Workspace")
    return { scopeKind: "Workspace", targetKind: null, targetMemberId: null };
  return {
    scopeKind: "Target",
    targetKind: scope.target._tag,
    targetMemberId: scope.target._tag === "Member" ? scope.target.memberId : null,
  };
};

/** The encoded form of a scope, to be validated with the record it belongs to. */
export const decode = (workspaceId: Workspace.Id, columns: Columns): unknown => {
  if (columns.scopeKind === "Workspace") return { _tag: "Workspace", workspaceId };
  return {
    _tag: "Target",
    target:
      columns.targetKind === "Member"
        ? { _tag: "Member", workspaceId, memberId: columns.targetMemberId }
        : { _tag: "Workspace", workspaceId },
  };
};

export * as ScopeColumns from "./scope.ts";
