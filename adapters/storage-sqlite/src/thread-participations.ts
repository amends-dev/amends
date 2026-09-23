import { ThreadParticipation, Thread, ThreadParticipationStore } from "@amends/core/thread";
import { GroupMembership } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";

import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(ThreadParticipation.Record));
const codec = Schema.fromJsonString(ThreadParticipation.Record);
const encode = Schema.encodeEffect(codec);
/** Member participations keep their workspace member and group admission as referenced columns. */
const memberColumns = (participant: ThreadParticipation.Participant) =>
  participant._tag === "Member"
    ? { memberId: participant.memberId, groupMembershipId: participant.groupMembershipId }
    : { memberId: null, groupMembershipId: null };
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: ThreadParticipation.Record.fields.workspaceId,
      id: ThreadParticipation.Id,
      threadId: ThreadParticipation.Record.fields.threadId,
      memberId: Schema.NullOr(Schema.String),
      groupMembershipId: Schema.NullOr(Schema.String),
      participantKey: Schema.String,
      record: codec,
    }).check(
      Schema.makeFilter((row) => {
        const expected = memberColumns(row.record.participant);
        return (
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.threadId === row.record.threadId &&
            row.memberId === expected.memberId &&
            row.groupMembershipId === expected.groupMembershipId &&
            row.participantKey === ThreadParticipation.keyOf(row.record.participant)) ||
          "Columns must match the stored record"
        );
      }),
    ),
  ),
);
const records = (rows: ReadonlyArray<{ readonly record: ThreadParticipation.Record }>) =>
  rows.map((row) => row.record);
/** Workspace-bound thread-participations projection storage. @category constructors */
export const make = Effect.fn("ThreadParticipations.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const columns = sql`workspace_id AS workspaceId, id, thread_id AS threadId, member_id AS memberId, group_membership_id AS groupMembershipId, participant_key AS participantKey, record`;
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
    getMany: Effect.fn("ThreadParticipations.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(ThreadParticipation.Id))(input);
        if (ids.length === 0) return [];
        return yield* guard(
          sql`SELECT ${columns} FROM thread_participations WHERE workspace_id = ${workspaceId} AND id ${inIds(sql, ids)}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records));
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "getMany")),
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
    end: Effect.fn("ThreadParticipations.end")(function* (input, time) {
      yield* Store.Transaction;
      const departure = yield* Schema.decodeEffect(ThreadParticipation.Departure)(input).pipe(
        Effect.mapError(storeConflict(ThreadParticipationStore, "end")),
      );
      const endedAt = yield* Schema.decodeEffect(Schema.toType(Schema.DateTimeUtcFromString))(
        time,
      ).pipe(Effect.mapError(storeConflict(ThreadParticipationStore, "end")));
      if (departure.workspaceId !== workspaceId)
        return yield* new ThreadParticipationStore.Conflict({
          operation: "end",
          message: "Departure belongs to another workspace",
        });
      const rows = yield* guard(
        sql`UPDATE thread_participations SET record = json_set(record, '$.status', 'ended', '$.endedAt', ${DateTime.formatIso(endedAt)}) WHERE workspace_id = ${workspaceId} AND id = ${departure.participationId} AND thread_id = ${departure.threadId} AND json_extract(record,'$.status') = 'active' RETURNING id`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadParticipationStore, "end")));
      if (rows.length !== 1)
        return yield* new ThreadParticipationStore.Conflict({
          operation: "end",
          message: "Participation is missing, mismatched, or already ended",
        });
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
      // A member's admission must belong to the thread's group; contacts and triage need only the thread.
      const participant = record.participant;
      const related = yield* guard(
        participant._tag === "Member"
          ? sql`SELECT t.id FROM threads t JOIN group_memberships g ON g.workspace_id=t.workspace_id AND g.group_id=t.group_id JOIN members m ON m.workspace_id=g.workspace_id AND m.id=g.member_id WHERE t.workspace_id = ${workspaceId} AND t.id = ${record.threadId} AND g.id = ${participant.groupMembershipId} AND g.member_id = ${participant.memberId} AND json_extract(m.record, '$.identity._tag') = ${participant.identity._tag} AND json_extract(m.record, '$.identity.id') = ${participant.identity.id}`
          : sql`SELECT id FROM threads WHERE workspace_id = ${workspaceId} AND id = ${record.threadId}`,
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
      const { memberId, groupMembershipId } = memberColumns(participant);
      yield* guard(
        sql`INSERT INTO thread_participations (workspace_id,id,thread_id,member_id,group_membership_id,participant_key,record) VALUES (${workspaceId},${record.id},${record.threadId},${memberId},${groupMembershipId},${ThreadParticipation.keyOf(participant)},${data})`,
        true,
      ).pipe(Effect.mapError(storeError(ThreadParticipationStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadParticipationStore.Service, make());
export * as ThreadParticipations from "./thread-participations.ts";
