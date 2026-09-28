import { Scope, Target } from "@amends/core/authorization";
import type { Workspace } from "@amends/core/workspace";
import type { scopeKinds, targetKinds } from "./schema.ts";

/** Columns encoding an assignment's scope without dropping variant information. */
export interface Columns {
  readonly scopeKind: (typeof scopeKinds)[number];
  readonly targetKind: (typeof targetKinds)[number] | null;
  readonly targetMemberId: string | null;
  readonly targetThreadId: string | null;
  readonly targetGroupId: string | null;
  readonly targetConnectionId: string | null;
}

/** The scope's workspace is the row's, so only the shape and target survive. */
export const encode = (scope: Scope.Value): Columns => {
  return Scope.Value.match(scope, {
    Workspace: (): Columns => ({
      scopeKind: "Workspace",
      targetKind: null,
      targetMemberId: null,
      targetThreadId: null,
      targetGroupId: null,
      targetConnectionId: null,
    }),
    Target: ({ target }): Columns => ({
      scopeKind: "Target",
      ...Target.Reference.match(target, {
        Workspace: (): Omit<Columns, "scopeKind"> => ({
          targetKind: "Workspace",
          targetMemberId: null,
          targetThreadId: null,
          targetGroupId: null,
          targetConnectionId: null,
        }),
        Member: ({ memberId }): Omit<Columns, "scopeKind"> => ({
          targetKind: "Member",
          targetMemberId: memberId,
          targetThreadId: null,
          targetGroupId: null,
          targetConnectionId: null,
        }),
        Thread: ({ threadId }): Omit<Columns, "scopeKind"> => ({
          targetKind: "Thread",
          targetMemberId: null,
          targetThreadId: threadId,
          targetGroupId: null,
          targetConnectionId: null,
        }),
        Group: ({ groupId }): Omit<Columns, "scopeKind"> => ({
          targetKind: "Group",
          targetMemberId: null,
          targetThreadId: null,
          targetGroupId: groupId,
          targetConnectionId: null,
        }),
        Connection: ({ connectionId }): Omit<Columns, "scopeKind"> => ({
          targetKind: "Connection",
          targetMemberId: null,
          targetThreadId: null,
          targetGroupId: null,
          targetConnectionId: connectionId,
        }),
      }),
    }),
  });
};

/** Each kind of target's ID column, and the field that ID fills in the target. */
const targetIds = {
  Member: ["targetMemberId", "memberId"],
  Thread: ["targetThreadId", "threadId"],
  Group: ["targetGroupId", "groupId"],
  Connection: ["targetConnectionId", "connectionId"],
} as const;
type TargetIdColumn = (typeof targetIds)[keyof typeof targetIds][0];

/** Whether no target ID column is set but the one kept. */
const onlySet = (columns: Columns, kept?: TargetIdColumn) =>
  Object.values(targetIds).every(([column]) => column === kept || columns[column] === null);

/** The encoded form of a scope, to be validated with the record it belongs to. */
export const decode = (workspaceId: Workspace.Id, columns: Columns): unknown => {
  if (columns.scopeKind === "Workspace")
    return columns.targetKind === null && onlySet(columns)
      ? { _tag: "Workspace", workspaceId }
      : undefined;
  if (columns.scopeKind !== "Target" || columns.targetKind === null) return undefined;
  if (columns.targetKind === "Workspace")
    return onlySet(columns)
      ? { _tag: "Target", target: { _tag: "Workspace", workspaceId } }
      : undefined;
  // Stored data may name a kind this code does not know.
  const ids: Partial<Record<string, readonly [TargetIdColumn, string]>> = targetIds;
  const entry = ids[columns.targetKind];
  if (entry === undefined) return undefined;
  const [column, field] = entry;
  return onlySet(columns, column)
    ? {
        _tag: "Target",
        target: { _tag: columns.targetKind, workspaceId, [field]: columns[column] },
      }
    : undefined;
};

export * as ScopeColumns from "./scope.ts";
