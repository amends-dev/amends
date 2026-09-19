import { Store } from "@amends/core/journal";
import { Ownership, Workspace, WorkspaceStore } from "@amends/core/workspace";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { makeRecordDecoder } from "./record-column.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Workspace.Record));

const codec = Schema.fromJsonString(Workspace.Record);
const decode = makeRecordDecoder(codec);
const encode = Schema.encodeEffect(codec);

/**
 * Workspace metadata, with ownership changes guarded by the previous owner.
 *
 * @category constructors
 */
export const make = Effect.fn("Workspaces.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  return WorkspaceStore.Service.of({
    workspaceId,
    get: guard(sql`SELECT record FROM workspaces WHERE workspace_id = ${workspaceId}`).pipe(
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
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(WorkspaceStore, "insert")),
      );
      yield* guard(sql`INSERT INTO workspaces VALUES (${workspaceId}, ${data})`, true).pipe(
        Effect.mapError(storeError(WorkspaceStore, "insert")),
      );
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
        sql`UPDATE workspaces SET record = json_set(record, '$.ownerMemberId', ${change.ownerMemberId}) WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.ownerMemberId') = ${change.previousOwnerMemberId} RETURNING workspace_id`,
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
