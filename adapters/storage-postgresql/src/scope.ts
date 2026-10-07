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
  readonly targetConnectionV2Id: string | null;
}

/** Each kind of target's ID column, and the field that ID fills in the target. */
const targetIds = {
  Member: ["targetMemberId", "memberId"],
  Thread: ["targetThreadId", "threadId"],
  Group: ["targetGroupId", "groupId"],
  ConnectionV2: ["targetConnectionV2Id", "connectionId"],
} as const;
type TargetIdColumn = (typeof targetIds)[keyof typeof targetIds][0];

const none = {
  targetMemberId: null,
  targetThreadId: null,
  targetGroupId: null,
  targetConnectionV2Id: null,
} satisfies Record<TargetIdColumn, null>;

/** A target's columns: its kind, and only its own ID column set. */
const target = (
  targetKind: (typeof targetKinds)[number],
  id?: readonly [TargetIdColumn, string],
): Omit<Columns, "scopeKind"> =>
  Object.assign({ targetKind }, none, id === undefined ? {} : { [id[0]]: id[1] });

/** The scope's workspace is the row's, so only the shape and target survive. */
export const encode = (scope: Scope.Value): Columns =>
  Scope.Value.match(scope, {
    Workspace: (): Columns =>
      Object.assign({ scopeKind: "Workspace" as const, targetKind: null }, none),
    Target: (value): Columns =>
      Object.assign(
        { scopeKind: "Target" as const },
        Target.Reference.match(value.target, {
          Workspace: () => target("Workspace"),
          Member: ({ memberId }) => target("Member", [targetIds.Member[0], memberId]),
          Thread: ({ threadId }) => target("Thread", [targetIds.Thread[0], threadId]),
          Group: ({ groupId }) => target("Group", [targetIds.Group[0], groupId]),
          ConnectionV2: ({ connectionId }) =>
            target("ConnectionV2", [targetIds.ConnectionV2[0], connectionId]),
        }),
      ),
  });

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
