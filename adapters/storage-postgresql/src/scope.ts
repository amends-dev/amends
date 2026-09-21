import { Scope, Target } from "@amends/core/authorization";
import type { Workspace } from "@amends/core/workspace";
import type { scopeKinds, targetKinds } from "./schema.ts";

/** Columns encoding an assignment's scope without dropping variant information. */
export interface Columns {
  readonly scopeKind: (typeof scopeKinds)[number];
  readonly targetKind: (typeof targetKinds)[number] | null;
  readonly targetMemberId: string | null;
  readonly targetThreadId: string | null;
}

/** The scope's workspace is the row's, so only the shape and target survive. */
export const encode = (scope: Scope.Value): Columns => {
  return Scope.Value.match(scope, {
    Workspace: (): Columns => ({
      scopeKind: "Workspace",
      targetKind: null,
      targetMemberId: null,
      targetThreadId: null,
    }),
    Target: ({ target }): Columns => ({
      scopeKind: "Target",
      ...Target.Reference.match(target, {
        Workspace: (): Omit<Columns, "scopeKind"> => ({
          targetKind: "Workspace",
          targetMemberId: null,
          targetThreadId: null,
        }),
        Member: ({ memberId }): Omit<Columns, "scopeKind"> => ({
          targetKind: "Member",
          targetMemberId: memberId,
          targetThreadId: null,
        }),
        Thread: ({ threadId }): Omit<Columns, "scopeKind"> => ({
          targetKind: "Thread",
          targetMemberId: null,
          targetThreadId: threadId,
        }),
      }),
    }),
  });
};

/** The encoded form of a scope, to be validated with the record it belongs to. */
export const decode = (workspaceId: Workspace.Id, columns: Columns): unknown => {
  if (columns.scopeKind === "Workspace")
    return columns.targetKind === null &&
      columns.targetMemberId === null &&
      columns.targetThreadId === null
      ? { _tag: "Workspace", workspaceId }
      : undefined;
  if (columns.scopeKind !== "Target") return undefined;
  switch (columns.targetKind) {
    case "Workspace":
      return columns.targetMemberId === null && columns.targetThreadId === null
        ? { _tag: "Target", target: { _tag: "Workspace", workspaceId } }
        : undefined;
    case "Member":
      return columns.targetThreadId === null
        ? {
            _tag: "Target",
            target: { _tag: "Member", workspaceId, memberId: columns.targetMemberId },
          }
        : undefined;
    case "Thread":
      return columns.targetMemberId === null
        ? {
            _tag: "Target",
            target: { _tag: "Thread", workspaceId, threadId: columns.targetThreadId },
          }
        : undefined;
    default:
      return undefined;
  }
};

export * as ScopeColumns from "./scope.ts";
