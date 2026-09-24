import { ThreadParticipation, Thread, ThreadParticipationStore } from "@amends/core/thread";
import { GroupMembership } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, eq, sql } from "drizzle-orm";
import { threadParticipations } from "./schema.ts";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
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
type Row = typeof threadParticipations.$inferSelect;
/** Each participant kind reads only its own columns; the table constraint rejects mixed rows. */
const toRecord = ({
  participantKind,
  memberId,
  groupMembershipId,
  identityKind,
  identityId,
  ...row
}: Row) => ({
  ...row,
  participant:
    participantKind === "Member"
      ? {
          _tag: participantKind,
          memberId,
          groupMembershipId,
          identity: { _tag: identityKind, id: identityId },
        }
      : participantKind === "Contact"
        ? { _tag: participantKind, contactId: identityId }
        : { _tag: participantKind },
});
type ParticipantColumns = Pick<
  typeof threadParticipations.$inferInsert,
  "participantKind" | "memberId" | "groupMembershipId" | "identityKind" | "identityId"
>;
const participantColumns = (participant: ThreadParticipation.Participant) =>
  ThreadParticipation.Participant.match(participant, {
    Member: ({ memberId, groupMembershipId, identity }): ParticipantColumns => ({
      participantKind: "Member",
      memberId,
      groupMembershipId,
      identityKind: identity._tag,
      identityId: identity.id,
    }),
    Contact: ({ contactId }): ParticipantColumns => ({
      participantKind: "Contact",
      memberId: null,
      groupMembershipId: null,
      identityKind: "Contact",
      identityId: contactId,
    }),
    Triage: (): ParticipantColumns => ({
      participantKind: "Triage",
      memberId: null,
      groupMembershipId: null,
      identityKind: null,
      identityId: null,
    }),
  });
const decodeRows = (rows: ReadonlyArray<Row>) =>
  decode(rows.map(toRecord)).pipe(
    Effect.flatMap((values) => Effect.forEach(values, (record) => validate(record))),
  );
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
    getMany: Effect.fn("ThreadParticipations.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(ThreadParticipation.Id))(input);
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(threadParticipations)
            .where(and(inWorkspace, inIds(threadParticipations.id, ids))),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "getMany")),
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
    pageActiveByThread: Effect.fn("ThreadParticipations.pageActiveByThread")(
      function* (threadInput, input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(threadInput);
        const options = yield* Schema.decodeEffect(ThreadParticipation.ListOptions)(input);
        const orderedId = sql`${threadParticipations.id} COLLATE "C"`;
        return yield* guard(
          db
            .select()
            .from(threadParticipations)
            .where(
              and(
                inWorkspace,
                eq(threadParticipations.threadId, id),
                eq(threadParticipations.status, "active"),
                options.after === undefined ? undefined : sql`${orderedId} > ${options.after}`,
              ),
            )
            .orderBy(orderedId)
            .limit(options.limit),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "pageActiveByThread")),
    ),
    findActive: Effect.fn("ThreadParticipations.findActive")(
      function* (threadInput, input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(threadInput);
        const references = yield* Schema.decodeEffect(Schema.Array(ThreadParticipation.Reference))(
          input,
        );
        if (references.length === 0) return [];
        // Each participant as the active-participation index keys it: its kind and ID.
        const kinds = references.map((reference) => reference._tag);
        const keys = references.map((reference) =>
          reference._tag === "Member"
            ? reference.memberId
            : reference._tag === "Contact"
              ? reference.contactId
              : "",
        );
        return yield* guard(
          db
            .select()
            .from(threadParticipations)
            .where(
              and(
                inWorkspace,
                eq(threadParticipations.threadId, id),
                eq(threadParticipations.status, "active"),
                sql`(${threadParticipations.participantKind}, coalesce(${threadParticipations.memberId}, ${threadParticipations.identityId}, '')) in (select * from unnest(${sql.param(kinds)}::text[], ${sql.param(keys)}::text[]))`,
              ),
            ),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(ThreadParticipationStore, "findActive")),
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
        db
          .update(threadParticipations)
          .set({ status: "ended", endedAt: DateTime.toDate(endedAt) })
          .where(
            and(
              inWorkspace,
              eq(threadParticipations.id, departure.participationId),
              eq(threadParticipations.threadId, departure.threadId),
              eq(threadParticipations.status, "active"),
            ),
          )
          .returning({ id: threadParticipations.id }),
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
      const participant = record.participant;
      const { participant: _, ...fields } = record;
      yield* guard(
        db.insert(threadParticipations).values({
          ...fields,
          ...participantColumns(participant),
          joinedAt: DateTime.toDate(record.joinedAt),
          endedAt: record.endedAt === null ? null : DateTime.toDate(record.endedAt),
        }),
        true,
      ).pipe(Effect.mapError(storeError(ThreadParticipationStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadParticipationStore.Service, make());
export * as ThreadParticipations from "./thread-participations.ts";
