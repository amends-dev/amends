import { ThreadParticipation, Thread, ThreadParticipationStore } from "@amends/core/thread";
import { GroupMembership } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";

import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(ThreadParticipation.Record));
const codec = Schema.fromJsonString(ThreadParticipation.Record);
const encode = Schema.encodeEffect(codec);
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: ThreadParticipation.Record.fields.workspaceId,
      id: ThreadParticipation.Id,
      threadId: ThreadParticipation.Record.fields.threadId,
      memberId: ThreadParticipation.Record.fields.memberId,
      groupMembershipId: ThreadParticipation.Record.fields.groupMembershipId,
      record: codec,
    }).check(
      Schema.makeFilter(
        (row) =>
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.threadId === row.record.threadId &&
            row.memberId === row.record.memberId &&
            row.groupMembershipId === row.record.groupMembershipId) ||
          "Columns must match the stored record",
      ),
    ),
  ),
);
const records = (rows: ReadonlyArray<{ readonly record: ThreadParticipation.Record }>) =>
  rows.map((row) => row.record);
/** Workspace-bound thread-participations projection storage. @category constructors */
export const make = Effect.fn("ThreadParticipations.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const columns = sql`workspace_id AS workspaceId, id, thread_id AS threadId, member_id AS memberId, group_membership_id AS groupMembershipId, record`;
  return ThreadParticipationStore.Service.of({
    workspaceId,
    get: Effect.fn("ThreadParticipations.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ThreadParticipation.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM thread_participations WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "get")),
    ),
    listByThread: Effect.fn("ThreadParticipations.listByThread")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM thread_participations WHERE workspace_id = ${workspaceId} AND thread_id = ${id} ORDER BY id COLLATE BINARY`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "listByThread")),
    ),
    listByAdmission: Effect.fn("ThreadParticipations.listByAdmission")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupMembership.Id)(input);
        return yield* guard(
          sql`SELECT ${columns} FROM thread_participations WHERE workspace_id = ${workspaceId} AND group_membership_id = ${id} ORDER BY id COLLATE BINARY`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "listByAdmission")),
    ),
    endByAdmission: Effect.fn("ThreadParticipations.endByAdmission")(function* (input, time) {
      yield* Store.Transaction;
      const id = yield* Schema.decodeEffect(GroupMembership.Id)(input).pipe(
        Effect.mapError(storeConflict(ThreadParticipationStore, "endByAdmission")),
      );
      const endedAt = yield* Schema.decodeEffect(Schema.toType(Schema.DateTimeUtcFromString))(
        time,
      ).pipe(Effect.mapError(storeConflict(ThreadParticipationStore, "endByAdmission")));
      yield* guard(
        sql`UPDATE thread_participations SET record = json_set(record, '$.status', 'ended', '$.endedAt', ${DateTime.formatIso(endedAt)}) WHERE workspace_id = ${workspaceId} AND group_membership_id = ${id} AND json_extract(record,'$.status') = 'active'`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadParticipationStore, "endByAdmission")));
    }),
    insert: Effect.fn("ThreadParticipations.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(ThreadParticipationStore, "insert")),
      );
      if (
        record.workspaceId !== workspaceId ||
        record.status !== "active" ||
        record.endedAt !== null
      )
        return yield* new ThreadParticipationStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      const related = yield* guard(
        sql`SELECT t.id FROM threads t JOIN group_memberships g ON g.workspace_id=t.workspace_id AND g.group_id=t.group_id JOIN members m ON m.workspace_id=g.workspace_id AND m.id=g.member_id WHERE t.workspace_id = ${workspaceId} AND t.id = ${record.threadId} AND g.id = ${record.groupMembershipId} AND g.member_id = ${record.memberId} AND json_extract(m.record, '$.identity._tag') = ${record.identity._tag} AND json_extract(m.record, '$.identity.id') = ${record.identity.id}`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadParticipationStore, "insert")));
      if (related.length === 0)
        return yield* new ThreadParticipationStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(ThreadParticipationStore, "insert")),
      );
      yield* guard(
        sql`INSERT INTO thread_participations (workspace_id,id,thread_id,member_id,group_membership_id,record) VALUES (${workspaceId},${record.id},${record.threadId},${record.memberId},${record.groupMembershipId},${data})`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadParticipationStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadParticipationStore.Service, make());
export * as ThreadParticipations from "./thread-participations.ts";
