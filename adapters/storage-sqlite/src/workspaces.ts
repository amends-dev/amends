import { Store } from "@amends/core/journal";
import { Workspace, WorkspaceStore } from "@amends/core/workspace";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { makeRecordDecoder } from "./record-column.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Workspace.Record));

const codec = Schema.fromJsonString(Workspace.Record);
const decode = makeRecordDecoder(codec);
const encode = Schema.encodeEffect(codec);

/**
 * The workspace's own record, inserted once by initialization.
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
  });
});

/**
 * Provide WorkspaceStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceStore.Service, make());

export * as Workspaces from "./workspaces.ts";
