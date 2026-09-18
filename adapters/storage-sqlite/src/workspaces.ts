import { Store } from "@amends/core/journal";
import { Workspace, WorkspaceStore } from "@amends/core/workspace";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { recordColumn } from "./record-column.ts";

const codec = Schema.fromJsonString(Workspace.Record);
const decode = recordColumn(codec);
const encode = Schema.encodeEffect(codec);

/** The workspace's own record, inserted once by initialization. */
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
    insert: Effect.fn("Workspaces.insert")(function* (record) {
      yield* Store.Transaction;
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

export const layer = Layer.effect(WorkspaceStore.Service, make());

export * as Workspaces from "./workspaces.ts";
