import { ThreadActivity, Thread, ThreadActivityStore } from "@amends/core/thread";

import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";

import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(ThreadActivity.Record));
const codec = Schema.fromJsonString(ThreadActivity.Record);
const encode = Schema.encodeEffect(codec);
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: ThreadActivity.Common.fields.workspaceId,
      id: ThreadActivity.Id,
      threadId: ThreadActivity.Common.fields.threadId,
      messageId: Schema.NullOr(ThreadActivity.MessagePublished.fields.messageId),
      participationId: Schema.NullOr(ThreadActivity.ParticipationFollowed.fields.participationId),
      sequence: ThreadActivity.Common.fields.sequence,
      record: codec,
    }).check(
      Schema.makeFilter(
        (row) =>
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.threadId === row.record.threadId &&
            (row.record.kind === "MessagePublished"
              ? row.messageId === row.record.messageId && row.participationId === null
              : row.messageId === null && row.participationId === row.record.participationId) &&
            row.sequence === row.record.sequence) ||
          "Columns must match the stored record",
      ),
    ),
  ),
);
const records = (rows: ReadonlyArray<{ readonly record: ThreadActivity.Record }>) =>
  rows.map((row) => row.record);
/** Workspace-bound thread-activities projection storage. @category constructors */
export const make = Effect.fn("ThreadActivities.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const columns = sql`workspace_id AS workspaceId, id, thread_id AS threadId, message_id AS messageId, participation_id AS participationId, sequence, record`;
  return ThreadActivityStore.Service.of({
    workspaceId,
    get: Effect.fn("ThreadActivities.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ThreadActivity.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM thread_activities WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "get")),
    ),
    listByThread: Effect.fn("ThreadActivities.listByThread")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM thread_activities WHERE workspace_id = ${workspaceId} AND thread_id = ${id} ORDER BY sequence`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "listByThread")),
    ),
    latest: Effect.fn("ThreadActivities.latest")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM thread_activities WHERE workspace_id = ${workspaceId} AND thread_id = ${id} ORDER BY sequence DESC LIMIT 1`,
        ).pipe(Effect.flatMap(decode), Effect.map(records), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "latest")),
    ),
    readPage: Effect.fn("ThreadActivities.readPage")(
      function* (input, options) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        const request = yield* Schema.decodeEffect(ThreadActivityStore.ReadOptions)(options);
        return yield* guard(
          sql`SELECT ${columns} FROM thread_activities WHERE workspace_id = ${workspaceId} AND thread_id = ${id} AND sequence > ${request.afterSequence ?? 0} ORDER BY sequence LIMIT ${request.limit}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "readPage")),
    ),
    insert: Effect.fn("ThreadActivities.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(ThreadActivityStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      const related = yield* guard(
        record.kind === "MessagePublished"
          ? sql`SELECT id FROM thread_messages WHERE workspace_id = ${workspaceId} AND id = ${record.messageId} AND thread_id = ${record.threadId}`
          : record.kind === "ParticipationFollowed"
            ? sql`SELECT id FROM thread_participations WHERE workspace_id = ${workspaceId} AND id = ${record.participationId} AND thread_id = ${record.threadId} AND json_extract(record, '$.joinedAtSequence') = ${record.sequence}`
            : sql`SELECT id FROM thread_participations WHERE workspace_id = ${workspaceId} AND id = ${record.participationId} AND thread_id = ${record.threadId} AND json_extract(record, '$.joinedAtSequence') < ${record.sequence} AND json_extract(record, '$.status') = 'ended' AND json_extract(record, '$.endedAt') = ${DateTime.formatIso(record.occurredAt)}`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadActivityStore, "insert")));
      if (related.length === 0)
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      const sequenceRows = yield* guard(
        sql<{
          next: number;
        }>`SELECT coalesce(max(sequence),0)+1 AS next FROM thread_activities WHERE workspace_id = ${workspaceId} AND thread_id = ${record.threadId}`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadActivityStore, "insert")));
      if (sequenceRows[0]?.next !== record.sequence)
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Activity must follow the current thread sequence",
        });
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(ThreadActivityStore, "insert")),
      );
      yield* guard(
        sql`INSERT INTO thread_activities (workspace_id,id,thread_id,message_id,participation_id,sequence,record) VALUES (${workspaceId},${record.id},${record.threadId},${record.kind === "MessagePublished" ? record.messageId : null},${record.kind !== "MessagePublished" ? record.participationId : null},${record.sequence},${data})`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadActivityStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadActivityStore.Service, make());
export * as ThreadActivities from "./thread-activities.ts";
