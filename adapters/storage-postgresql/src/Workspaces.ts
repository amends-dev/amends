/**
 * The PostgreSQL driver for `WorkspaceStore.WorkspaceStore`, over the `workspaces` table: one row
 * per workspace, keyed by its ID, with its name, creator, and owner. `WorkspaceStore.make` checks
 * every input before the driver sees it, so the driver keeps only what storage keeps: the primary
 * key rejects creating the workspace twice, and renaming and transferring
 * ownership are conditional updates rejected unless the row still holds the previous name or
 * owner. Every statement is scoped to the binding's workspace and runs under its `guard`, which
 * lets a read join the caller's transaction and requires one for a write.
 *
 * @since 0.1.0
 */
import { Workspace, WorkspaceStore } from "@amends-dev/core/workspace";
import { and, eq } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeError } from "./internal/errors.ts";
import { workspaces } from "./internal/schema.ts";
import { StoreError } from "@amends-dev/core/journal";

/** Selected in the record's shape; decoding checks the brands. */
const recordColumns = {
  id: workspaces.workspaceId,
  name: workspaces.name,
  createdBy: workspaces.createdBy,
  ownerMemberId: workspaces.ownerMemberId,
};
const decode = Schema.decodeUnknownEffect(Schema.Array(Workspace.Workspace));

/**
 * Builds the workspace store for the binding's workspace: this module's driver inside
 * `WorkspaceStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Workspaces.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const own = eq(workspaces.workspaceId, workspaceId);
  const driver: WorkspaceStore.WorkspaceStore["Service"] = {
    get: guard(db.select(recordColumns).from(workspaces).where(own)).pipe(
      Effect.flatMap(decode),
      Effect.map(Array.head),
      Effect.mapError(StoreError.failed("WorkspaceStore", "get")),
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
      ).pipe(Effect.mapError(storeError("WorkspaceStore", "insert")));
    }),
    rename: Effect.fn("Workspaces.rename")(function* (change) {
      const rows = yield* guard(
        db
          .update(workspaces)
          .set({ name: change.name })
          .where(and(own, eq(workspaces.name, change.previousName)))
          .returning({ id: workspaces.workspaceId }),
        true,
      ).pipe(Effect.mapError(storeError("WorkspaceStore", "rename")));
      if (rows.length === 0)
        return yield* StoreError.rejected(
          "WorkspaceStore",
          "rename",
          "Workspace is missing or name has changed",
        );
    }),
    transferOwnership: Effect.fn("Workspaces.transferOwnership")(function* (change) {
      const rows = yield* guard(
        db
          .update(workspaces)
          .set({ ownerMemberId: change.ownerMemberId })
          .where(and(own, eq(workspaces.ownerMemberId, change.previousOwnerMemberId)))
          .returning({ id: workspaces.workspaceId }),
        true,
      ).pipe(Effect.mapError(storeError("WorkspaceStore", "transferOwnership")));
      if (rows.length === 0)
        return yield* StoreError.rejected(
          "WorkspaceStore",
          "transferOwnership",
          "Workspace is missing or ownership has changed",
        );
    }),
  };
  return WorkspaceStore.make(workspaceId, driver);
});

/**
 * Provides `WorkspaceStore.WorkspaceStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(WorkspaceStore.WorkspaceStore, make());
