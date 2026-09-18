import { Store } from "@amends/core/journal";
import { Workspace, WorkspaceStore } from "@amends/core/workspace";
import { eq } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { workspaces } from "./schema.ts";

/** Selected in the record's shape; decoding checks the brands. */
const record = {
  id: workspaces.workspaceId,
  createdBy: workspaces.createdBy,
  ownerMemberId: workspaces.ownerMemberId,
};
const decode = Schema.decodeUnknownEffect(Schema.Array(Workspace.Record));

/** The workspace's own record, inserted once by initialization. */
export const make = Effect.fn("Workspaces.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const own = eq(workspaces.workspaceId, workspaceId);
  return WorkspaceStore.Service.of({
    workspaceId,
    get: guard(db.select(record).from(workspaces).where(own)).pipe(
      Effect.flatMap(decode),
      Effect.map(Array.head),
      Effect.mapError(storeFailure(WorkspaceStore, "get")),
    ),
    insert: Effect.fn("Workspaces.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.id !== workspaceId)
        return yield* new WorkspaceStore.Conflict({
          operation: "insert",
          message: "Record belongs to another workspace",
        });
      yield* guard(
        db.insert(workspaces).values({
          workspaceId,
          createdBy: record.createdBy,
          ownerMemberId: record.ownerMemberId,
        }),
        true,
      ).pipe(Effect.mapError(storeError(WorkspaceStore, "insert")));
    }),
  });
});

export const layer = Layer.effect(WorkspaceStore.Service, make());

export * as Workspaces from "./workspaces.ts";
