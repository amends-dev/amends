import { Group, GroupStore } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Group.Record));
const codec = Schema.fromJsonString(Group.Record);
const encode = Schema.encodeEffect(codec);
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: Group.Record.fields.workspaceId,
      id: Group.Id,
      createdBy: Group.Record.fields.createdBy,
      record: codec,
    }).check(
      Schema.makeFilter(
        (row) =>
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.createdBy === row.record.createdBy) ||
          "Group columns must match the stored record",
      ),
    ),
  ),
);

/** Group records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Groups.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  return GroupStore.Service.of({
    workspaceId,
    get: Effect.fn("Groups.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Group.Id)(input);
        const rows = yield* guard(
          sql`SELECT workspace_id AS workspaceId, id, created_by AS createdBy, record FROM groups WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ).pipe(Effect.flatMap(decode));
        return Array.head(rows.map(({ record }) => record));
      },
      Effect.mapError(storeFailure(GroupStore, "get")),
    ),
    insert: Effect.fn("Groups.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(GroupStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new GroupStore.Conflict({
          operation: "insert",
          message: "Expected a group in this workspace",
        });
      const creator = yield* guard(
        sql`SELECT id FROM members WHERE workspace_id = ${workspaceId} AND id = ${record.createdBy}`,
        true,
      ).pipe(Effect.mapError(storeError(GroupStore, "insert")));
      if (creator.length === 0)
        return yield* new GroupStore.Conflict({
          operation: "insert",
          message: "Creator membership is missing",
        });
      const data = yield* encode(record).pipe(Effect.mapError(storeFailure(GroupStore, "insert")));
      yield* guard(
        sql`INSERT INTO groups (workspace_id, id, created_by, record) VALUES (${workspaceId}, ${record.id}, ${record.createdBy}, ${data})`,
        true,
      ).pipe(Effect.mapError(storeError(GroupStore, "insert")));
    }),
  });
});

/** Provide group storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupStore.Service, make());

export * as Groups from "./groups.ts";
