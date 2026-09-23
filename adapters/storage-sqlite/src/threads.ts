import { Thread, ThreadStore } from "@amends/core/thread";
import { Group } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";

import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(Thread.Record));
const codec = Schema.fromJsonString(Thread.Record);
const encode = Schema.encodeEffect(codec);
/** Member creators keep their workspace member as a referenced column; contacts have none. */
const creatorMemberOf = (record: Thread.Record) =>
  record.createdBy._tag === "Member" ? record.createdBy.memberId : null;
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: Thread.Record.fields.workspaceId,
      id: Thread.Id,
      groupId: Thread.Record.fields.groupId,
      createdBy: Schema.NullOr(Schema.String),
      record: codec,
    }).check(
      Schema.makeFilter(
        (row) =>
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.groupId === row.record.groupId &&
            row.createdBy === creatorMemberOf(row.record)) ||
          "Columns must match the stored record",
      ),
    ),
  ),
);
const records = (rows: ReadonlyArray<{ readonly record: Thread.Record }>) =>
  rows.map((row) => row.record);
const decodeLatest = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...Thread.Latest.fields, occurredAt: Schema.DateTimeUtcFromMillis }),
  ),
);
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
    listByLatest: Effect.fn("Threads.listByLatest")(
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const options = yield* Schema.decodeEffect(Schema.toType(Thread.ListOptions))(input);
        const before =
          options.before === undefined
            ? sql``
            : sql`AND (latest_activity_at, id) < (${DateTime.toEpochMillis(options.before.latestActivityAt)}, ${options.before.threadId})`;
        return yield* guard(
          sql`SELECT ${columns} FROM threads WHERE workspace_id = ${workspaceId} AND group_id = ${groupId} AND latest_activity_at IS NOT NULL ${before} ORDER BY latest_activity_at DESC, id COLLATE BINARY DESC LIMIT ${options.limit}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(ThreadStore, "listByLatest")),
    ),
    getLatest: Effect.fn("Threads.getLatest")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Thread.Id))(input);
        if (ids.length === 0) return [];
        return yield* guard(
          sql`SELECT id AS threadId, latest_sequence AS sequence, latest_activity_at AS occurredAt FROM threads WHERE workspace_id = ${workspaceId} AND id ${inIds(sql, ids)} AND latest_sequence IS NOT NULL`,
        ).pipe(Effect.flatMap(decodeLatest));
      },
      Effect.mapError(storeFailure(ThreadStore, "getLatest")),
    ),
    recordLatest: Effect.fn("Threads.recordLatest")(function* (input) {
      yield* Store.Transaction;
      const latest = yield* Schema.decodeEffect(Schema.toType(Thread.Latest))(input).pipe(
        Effect.mapError(storeConflict(ThreadStore, "recordLatest")),
      );
      const advanced = yield* guard(
        sql`UPDATE threads SET latest_sequence = ${latest.sequence}, latest_activity_at = ${DateTime.toEpochMillis(latest.occurredAt)} WHERE workspace_id = ${workspaceId} AND id = ${latest.threadId} AND (latest_sequence IS NULL OR latest_sequence < ${latest.sequence}) RETURNING id`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "recordLatest")));
      if (advanced.length > 0) return;
      // Nothing advanced: an earlier position changes nothing, but the thread must exist.
      const found = yield* guard(
        sql`SELECT id FROM threads WHERE workspace_id = ${workspaceId} AND id = ${latest.threadId}`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "recordLatest")));
      if (found.length === 0)
        return yield* new ThreadStore.Conflict({
          operation: "recordLatest",
          message: "Thread is missing",
        });
    }),
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
      const creator = record.createdBy;
      const related = yield* guard(
        creator._tag === "Member"
          ? sql`SELECT t.id FROM groups t JOIN members m ON m.workspace_id=t.workspace_id WHERE t.workspace_id = ${workspaceId} AND t.id = ${record.groupId} AND m.id = ${creator.memberId}`
          : sql`SELECT id FROM groups WHERE workspace_id = ${workspaceId} AND id = ${record.groupId}`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "insert")));
      if (related.length === 0)
        return yield* new ThreadStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      const data = yield* encode(record).pipe(Effect.mapError(storeFailure(ThreadStore, "insert")));
      yield* guard(
        sql`INSERT INTO threads (workspace_id,id,group_id,created_by,record) VALUES (${workspaceId},${record.id},${record.groupId},${creatorMemberOf(record)},${data})`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadStore.Service, make());
export * as Threads from "./threads.ts";
