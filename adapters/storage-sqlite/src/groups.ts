import { Group, GroupStore } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Group.Record));
const codec = Schema.fromJsonString(Group.Record);
const encode = Schema.encodeEffect(codec);
const decodeLatest = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Group.Latest.fields, occurredAt: Schema.DateTimeUtcFromMillis })),
);
/** Only a direct group has a member-set key. */
const keyOf = (record: Group.Record) =>
  record.kind === "Direct" ? Group.directKey(record.memberIds) : null;
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: Group.TeamRecord.fields.workspaceId,
      id: Group.Id,
      createdBy: Group.TeamRecord.fields.createdBy,
      directKey: Schema.NullOr(Schema.String),
      record: codec,
    }).check(
      Schema.makeFilter(
        (row) =>
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.createdBy === row.record.createdBy &&
            row.directKey === keyOf(row.record)) ||
          "Group columns must match the stored record",
      ),
    ),
  ),
);

/** Group records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Groups.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const columns = sql`workspace_id AS workspaceId, id, created_by AS createdBy, direct_key AS directKey, record`;
  return GroupStore.Service.of({
    workspaceId,
    get: Effect.fn("Groups.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Group.Id)(input);
        const rows = yield* guard(
          sql`SELECT ${columns} FROM groups WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ).pipe(Effect.flatMap(decode));
        return Array.head(rows.map(({ record }) => record));
      },
      Effect.mapError(storeFailure(GroupStore, "get")),
    ),
    getMany: Effect.fn("Groups.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Group.Id))(input);
        if (ids.length === 0) return [];
        const rows = yield* guard(
          sql`SELECT ${columns} FROM groups WHERE workspace_id = ${workspaceId} AND id ${inIds(sql, ids)}`,
        ).pipe(Effect.flatMap(decode));
        return rows.map(({ record }) => record);
      },
      Effect.mapError(storeFailure(GroupStore, "getMany")),
    ),
    findDirect: Effect.fn("Groups.findDirect")(
      function* (input) {
        const memberIds = yield* Schema.decodeEffect(Group.DirectMembers)(
          Group.directMembers(input),
        );
        const rows = yield* guard(
          sql`SELECT ${columns} FROM groups WHERE workspace_id = ${workspaceId} AND direct_key = ${Group.directKey(memberIds)}`,
        ).pipe(Effect.flatMap(decode));
        return Option.flatMap(Array.head(rows), ({ record }) =>
          record.kind === "Direct" ? Option.some(record) : Option.none(),
        );
      },
      Effect.mapError(storeFailure(GroupStore, "findDirect")),
    ),
    getLatest: Effect.fn("Groups.getLatest")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Group.Id))(input);
        if (ids.length === 0) return [];
        return yield* guard(
          sql`SELECT id AS groupId, latest_activity_at AS occurredAt FROM groups WHERE workspace_id = ${workspaceId} AND id ${inIds(sql, ids)} AND latest_activity_at IS NOT NULL`,
        ).pipe(Effect.flatMap(decodeLatest));
      },
      Effect.mapError(storeFailure(GroupStore, "getLatest")),
    ),
    recordLatest: Effect.fn("Groups.recordLatest")(function* (input) {
      yield* Store.Transaction;
      const latest = yield* Schema.decodeEffect(Schema.toType(Group.Latest))(input).pipe(
        Effect.mapError(storeConflict(GroupStore, "recordLatest")),
      );
      const at = DateTime.toEpochMillis(latest.occurredAt);
      const advanced = yield* guard(
        sql`UPDATE groups SET latest_activity_at = ${at} WHERE workspace_id = ${workspaceId} AND id = ${latest.groupId} AND (latest_activity_at IS NULL OR latest_activity_at < ${at}) RETURNING id`,
        true,
      ).pipe(Effect.mapError(storeError(GroupStore, "recordLatest")));
      if (advanced.length > 0) return;
      // Nothing advanced: an earlier time changes nothing, but the group must exist.
      const found = yield* guard(
        sql`SELECT id FROM groups WHERE workspace_id = ${workspaceId} AND id = ${latest.groupId}`,
        true,
      ).pipe(Effect.mapError(storeError(GroupStore, "recordLatest")));
      if (found.length === 0)
        return yield* new GroupStore.Conflict({
          operation: "recordLatest",
          message: "Group is missing",
        });
    }),
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
        sql`INSERT INTO groups (workspace_id, id, created_by, direct_key, record) VALUES (${workspaceId}, ${record.id}, ${record.createdBy}, ${keyOf(record)}, ${data})`,
        true,
      ).pipe(Effect.mapError(storeError(GroupStore, "insert")));
    }),
  });
});

/** Provide group storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupStore.Service, make());

export * as Groups from "./groups.ts";
