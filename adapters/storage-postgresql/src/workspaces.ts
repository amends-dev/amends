import { Workspace, WorkspaceStore } from "@amends-dev/core/workspace";
import { and, eq } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import * as Binding from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { workspaces } from "./schema.ts";

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
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const own = eq(workspaces.workspaceId, workspaceId);
  const driver: WorkspaceStore.WorkspaceStore["Service"] = {
    get: guard(db.select(recordColumns).from(workspaces).where(own)).pipe(
      Effect.flatMap(decode),
      Effect.map(Array.head),
      Effect.mapError(storeFailure(WorkspaceStore, "get")),
    ),
    insert: Effect.fn("Workspaces.insert")(function* (record) {
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
    rename: Effect.fn("Workspaces.rename")(function* (change) {
      const rows = yield* guard(
        db
          .update(workspaces)
          .set({ name: change.name })
          .where(and(own, eq(workspaces.name, change.previousName)))
          .returning({ id: workspaces.workspaceId }),
        true,
      ).pipe(Effect.mapError(storeError(WorkspaceStore, "rename")));
      if (rows.length === 0)
        return yield* new WorkspaceStore.Conflict({
          operation: "rename",
          message: "Workspace is missing or name has changed",
        });
    }),
    transferOwnership: Effect.fn("Workspaces.transferOwnership")(function* (change) {
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
  };
  return WorkspaceStore.make(workspaceId, driver);
});

/**
 * Provide WorkspaceStore.WorkspaceStore using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceStore.WorkspaceStore, make());
