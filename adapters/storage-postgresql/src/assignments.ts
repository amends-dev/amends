import { Assignment, AssignmentStore } from "@amends-dev/core/authorization";
import type { Workspace } from "@amends-dev/core/workspace";
import { and, eq, type SQL } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import * as Binding from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { assignments } from "./schema.ts";
import * as ScopeColumns from "./scope.ts";

/** A row is one of two source cases, so it is shaped in code before decoding checks it. */
const toEncodedRecord = (row: typeof assignments.$inferSelect) => {
  const scope = ScopeColumns.decode(row.workspaceId as Workspace.Id, row);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    status: row.status,
    source:
      row.sourceKind === "Role"
        ? { _tag: "Role", roleId: row.roleId, scope }
        : { _tag: "Direct", grant: { permission: row.permission, scope } },
  };
};
const decode = Schema.decodeUnknownEffect(Schema.Array(Assignment.Record));

/**
 * Access assigned to memberships, by role or directly; revoked rows keep their source.
 *
 * @category constructors
 */
export const make = Effect.fn("Assignments.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(assignments.workspaceId, workspaceId);
  const select = (operation: string, where: SQL | undefined) =>
    guard(db.select().from(assignments).where(where).orderBy(assignments.id)).pipe(
      Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))),
      Effect.mapError(storeFailure(AssignmentStore, operation)),
    );
  const driver: AssignmentStore.AssignmentStore["Service"] = {
    get: (id) => Effect.map(select("get", and(inWorkspace, eq(assignments.id, id))), Array.head),
    listActiveByMember: (memberId) =>
      select(
        "listActiveByMember",
        and(inWorkspace, eq(assignments.memberId, memberId), eq(assignments.status, "active")),
      ),
    listActiveByRole: (roleId) =>
      select(
        "listActiveByRole",
        and(
          inWorkspace,
          eq(assignments.sourceKind, "Role"),
          eq(assignments.roleId, roleId),
          eq(assignments.status, "active"),
        ),
      ),
    insert: Effect.fn("Assignments.insert")(function* (record) {
      const source = record.source;
      yield* guard(
        db.insert(assignments).values({
          workspaceId,
          id: record.id,
          memberId: record.memberId,
          status: record.status,
          sourceKind: source._tag,
          roleId: Assignment.Source.isAnyOf(["Role"])(source) ? source.roleId : null,
          permission: Assignment.Source.isAnyOf(["Direct"])(source)
            ? source.grant.permission
            : null,
          ...ScopeColumns.encode(
            Assignment.Source.isAnyOf(["Role"])(source) ? source.scope : source.grant.scope,
          ),
        }),
        true,
      ).pipe(Effect.mapError(storeError(AssignmentStore, "insert")));
    }),
    markRevoked: Effect.fn("Assignments.markRevoked")(function* (id) {
      const rows = yield* guard(
        db
          .update(assignments)
          .set({ status: "revoked" })
          .where(and(inWorkspace, eq(assignments.id, id), eq(assignments.status, "active")))
          .returning({ id: assignments.id }),
        true,
      ).pipe(Effect.mapError(storeError(AssignmentStore, "markRevoked")));
      if (rows.length === 0)
        return yield* new AssignmentStore.Conflict({
          operation: "markRevoked",
          message: "Expected an active assignment",
        });
    }),
  };
  return AssignmentStore.make(workspaceId, driver);
});

/**
 * Provide AssignmentStore.AssignmentStore using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(AssignmentStore.AssignmentStore, make());
