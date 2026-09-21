import { ThreadParticipation, Thread, ThreadParticipationStore } from "@amends/core/thread";
import { GroupMembership } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, eq, sql } from "drizzle-orm";
import { threadParticipations, threads, groupMemberships, members } from "./schema.ts";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(ThreadParticipation.Record));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...ThreadParticipation.Record.fields,
      joinedAt: Schema.DateTimeUtcFromDate,
      endedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    }),
  ),
);
const decodeRows = (rows: ReadonlyArray<typeof threadParticipations.$inferSelect>) =>
  decode(
    rows.map(({ identityKind, identityId, ...row }) => ({
      ...row,
      identity: { _tag: identityKind, id: identityId },
    })),
  ).pipe(Effect.flatMap((values) => Effect.forEach(values, (record) => validate(record))));
/** Workspace-bound thread-participations projection storage. @category constructors */
export const make = Effect.fn("ThreadParticipations.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(threadParticipations.workspaceId, workspaceId);
  return ThreadParticipationStore.Service.of({
    workspaceId,
    get: Effect.fn("ThreadParticipations.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ThreadParticipation.Id)(input);
        return yield* guard(
          db
            .select()
            .from(threadParticipations)
            .where(and(inWorkspace, eq(threadParticipations.id, id))),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "get")),
    ),
    listByThread: Effect.fn("ThreadParticipations.listByThread")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* guard(
          db
            .select()
            .from(threadParticipations)
            .where(and(inWorkspace, eq(threadParticipations.threadId, id)))
            .orderBy(sql`${threadParticipations.id} COLLATE "C"`),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "listByThread")),
    ),
    listByAdmission: Effect.fn("ThreadParticipations.listByAdmission")(
      function* (input) {
        const id = yield* Schema.decodeEffect(GroupMembership.Id)(input);
        return yield* guard(
          db
            .select()
            .from(threadParticipations)
            .where(and(inWorkspace, eq(threadParticipations.groupMembershipId, id)))
            .orderBy(sql`${threadParticipations.id} COLLATE "C"`),
        ).pipe(Effect.flatMap(decodeRows));
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
        db
          .update(threadParticipations)
          .set({ status: "ended", endedAt: DateTime.toDate(endedAt) })
          .where(
            and(
              inWorkspace,
              eq(threadParticipations.groupMembershipId, id),
              eq(threadParticipations.status, "active"),
            ),
          ),
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
        db
          .select({ id: threads.id })
          .from(threads)
          .innerJoin(
            groupMemberships,
            and(
              eq(groupMemberships.workspaceId, threads.workspaceId),
              eq(groupMemberships.groupId, threads.groupId),
            ),
          )
          .innerJoin(
            members,
            and(
              eq(members.workspaceId, groupMemberships.workspaceId),
              eq(members.id, groupMemberships.memberId),
            ),
          )
          .where(
            and(
              eq(threads.workspaceId, workspaceId),
              eq(threads.id, record.threadId),
              eq(groupMemberships.id, record.groupMembershipId),
              eq(groupMemberships.memberId, record.memberId),
              eq(members.identityKind, record.identity._tag),
              eq(members.identityId, record.identity.id),
            ),
          ),
        true,
      ).pipe(Effect.mapError(storeError(ThreadParticipationStore, "insert")));
      if (related.length === 0)
        return yield* new ThreadParticipationStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      const { identity, ...fields } = record;
      yield* guard(
        db.insert(threadParticipations).values({
          ...fields,
          joinedAt: DateTime.toDate(record.joinedAt),
          endedAt: record.endedAt === null ? null : DateTime.toDate(record.endedAt),
          identityKind: identity._tag,
          identityId: identity.id,
        }),
        true,
      ).pipe(Effect.mapError(storeError(ThreadParticipationStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadParticipationStore.Service, make());
export * as ThreadParticipations from "./thread-participations.ts";
