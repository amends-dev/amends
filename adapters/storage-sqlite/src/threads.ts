import { Thread, ThreadStore } from "@amends/core/thread";
import { Group } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, Effect, Layer, Schema } from "effect";

import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(Thread.Record));
const codec = Schema.fromJsonString(Thread.Record);
const encode = Schema.encodeEffect(codec);
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: Thread.Record.fields.workspaceId,
      id: Thread.Id,
      groupId: Thread.Record.fields.groupId,
      createdBy: Thread.Record.fields.createdBy,
      record: codec,
    }).check(
      Schema.makeFilter(
        (row) =>
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.groupId === row.record.groupId &&
            row.createdBy === row.record.createdBy) ||
          "Columns must match the stored record",
      ),
    ),
  ),
);
const records = (rows: ReadonlyArray<{ readonly record: Thread.Record }>) =>
  rows.map((row) => row.record);
/** Workspace-bound threads projection storage. @category constructors */
export const make = Effect.fn("Threads.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const columns = sql`workspace_id AS workspaceId, id, group_id AS groupId, created_by AS createdBy, record`;
  return ThreadStore.Service.of({
    workspaceId,
    get: Effect.fn("Threads.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM threads WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ThreadStore, "get")),
    ),
    listByGroup: Effect.fn("Threads.listByGroup")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Group.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM threads WHERE workspace_id = ${workspaceId} AND group_id = ${id} ORDER BY id COLLATE BINARY`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(ThreadStore, "listByGroup")),
    ),
    insert: Effect.fn("Threads.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(ThreadStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ThreadStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      const related = yield* guard(
        sql`SELECT t.id FROM groups t JOIN members m ON m.workspace_id=t.workspace_id WHERE t.workspace_id = ${workspaceId} AND t.id = ${record.groupId} AND m.id = ${record.createdBy}`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "insert")));
      if (related.length === 0)
        return yield* new ThreadStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      const data = yield* encode(record).pipe(Effect.mapError(storeFailure(ThreadStore, "insert")));
      yield* guard(
        sql`INSERT INTO threads (workspace_id,id,group_id,created_by,record) VALUES (${workspaceId},${record.id},${record.groupId},${record.createdBy},${data})`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadStore.Service, make());
export * as Threads from "./threads.ts";
