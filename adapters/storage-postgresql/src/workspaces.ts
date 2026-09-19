import { Store } from "@amends/core/journal";
import { Ownership, Workspace, WorkspaceStore } from "@amends/core/workspace";
import { and, eq } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { workspaces } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Workspace.Record));

/** Selected in the record's shape; decoding checks the brands. */
const recordColumns = {
  id: workspaces.workspaceId,
  name: workspaces.name,
  createdBy: workspaces.createdBy,
  ownerMemberId: workspaces.ownerMemberId,
};
const decode = Schema.decodeUnknownEffect(Schema.Array(Workspace.Record));

/**
 * Workspace metadata, with ownership changes guarded by the previous owner.
 *
 * @category constructors
 */
export const make = Effect.fn("Workspaces.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const own = eq(workspaces.workspaceId, workspaceId);
  return WorkspaceStore.Service.of({
    workspaceId,
    get: guard(db.select(recordColumns).from(workspaces).where(own)).pipe(
      Effect.flatMap(decode),
      Effect.map(Array.head),
      Effect.mapError(storeFailure(WorkspaceStore, "get")),
    ),
    insert: Effect.fn("Workspaces.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(WorkspaceStore, "insert")),
      );
      if (record.id !== workspaceId)
        return yield* new WorkspaceStore.Conflict({
          operation: "insert",
          message: "Record belongs to another workspace",
        });
      yield* guard(
        db.insert(workspaces).values({
          workspaceId,
          name: record.name,
          createdBy: record.createdBy,
          ownerMemberId: record.ownerMemberId,
        }),
        true,
      ).pipe(Effect.mapError(storeError(WorkspaceStore, "insert")));
    }),
    transferOwnership: Effect.fn("Workspaces.transferOwnership")(function* (input) {
      yield* Store.Transaction;
      const change = yield* Schema.decodeEffect(Ownership.Change)(input).pipe(
        Effect.mapError(storeConflict(WorkspaceStore, "transferOwnership")),
      );
      if (change.workspaceId !== workspaceId)
        return yield* new WorkspaceStore.Conflict({
          operation: "transferOwnership",
          message: "Change belongs to another workspace",
        });
      const rows = yield* guard(
        db
          .update(workspaces)
          .set({ ownerMemberId: change.ownerMemberId })
          .where(and(own, eq(workspaces.ownerMemberId, change.previousOwnerMemberId)))
          .returning({ id: workspaces.workspaceId }),
        true,
      ).pipe(Effect.mapError(storeError(WorkspaceStore, "transferOwnership")));
      if (rows.length === 0)
        return yield* new WorkspaceStore.Conflict({
          operation: "transferOwnership",
          message: "Workspace is missing or ownership has changed",
        });
    }),
  });
});

/**
 * Provide WorkspaceStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceStore.Service, make());

export * as Workspaces from "./workspaces.ts";
