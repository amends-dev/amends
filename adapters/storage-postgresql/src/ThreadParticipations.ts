/**
 * The PostgreSQL driver for `ThreadParticipationStore.ThreadParticipationStore`, over the
 * `thread_participations` table: a participant is a member, a contact, or triage, stored as a kind
 * column beside that kind's own columns. `ThreadParticipationStore.make` checks every input before
 * the driver sees it, so the driver keeps only what storage keeps: the primary key refuses a reused
 * ID and `active_thread_participation` a second active participation for one participant in a
 * thread, each rejected, and ending one is a conditional update rejected unless it finds exactly
 * the addressed participation active. A departure from a group ends every participation of the
 * admission in one statement. Every statement is scoped to the binding's workspace and runs under
 * its `guard`, which lets a read join the caller's transaction and requires one for a write.
 *
 * @since 0.1.0
 */
import { ThreadParticipation, ThreadParticipationStore } from "@amends-dev/core/thread";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, eq, sql } from "drizzle-orm";
import { threadParticipations } from "./internal/schema.ts";
import * as Binding from "./Binding.ts";
import { inIds } from "./internal/id-list.ts";
import { storeError } from "./internal/errors.ts";
import { StoreError } from "@amends-dev/core/journal";
const validate = Schema.decodeEffect(Schema.toType(ThreadParticipation.ThreadParticipation));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...ThreadParticipation.ThreadParticipation.fields,
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
/**
 * Builds the participation store for the binding's workspace: this module's driver inside
 * `ThreadParticipationStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadParticipations.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(threadParticipations.workspaceId, workspaceId);
  const driver: ThreadParticipationStore.ThreadParticipationStore["Service"] = {
    get: Effect.fn("ThreadParticipations.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(threadParticipations)
            .where(and(inWorkspace, eq(threadParticipations.id, id))),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(StoreError.failed("ThreadParticipationStore", "get")),
    ),
    getMany: Effect.fn("ThreadParticipations.getMany")(
      function* (ids) {
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(threadParticipations)
            .where(and(inWorkspace, inIds(threadParticipations.id, ids))),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(StoreError.failed("ThreadParticipationStore", "getMany")),
    ),
    listByThread: Effect.fn("ThreadParticipations.listByThread")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(threadParticipations)
            .where(and(inWorkspace, eq(threadParticipations.threadId, id)))
            .orderBy(sql`${threadParticipations.id} COLLATE "C"`),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(StoreError.failed("ThreadParticipationStore", "listByThread")),
    ),
    pageActiveByThread: Effect.fn("ThreadParticipations.pageActiveByThread")(
      function* (id, options) {
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
      Effect.mapError(StoreError.failed("ThreadParticipationStore", "pageActiveByThread")),
    ),
    findActive: Effect.fn("ThreadParticipations.findActive")(
      function* (id, references) {
        if (references.length === 0) return [];
        // Each participant as the active-participation index keys it: its kind and ID.
        const kinds = references.map((reference) => reference._tag);
        const keys = references.map((reference) =>
          ThreadParticipation.Reference.isAnyOf(["Member"])(reference)
            ? reference.memberId
            : ThreadParticipation.Reference.isAnyOf(["Contact"])(reference)
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
      Effect.mapError(StoreError.failed("ThreadParticipationStore", "findActive")),
    ),
    endByAdmission: Effect.fn("ThreadParticipations.endByAdmission")(function* (id, endedAt) {
      // One statement however many there are; participations_by_admission finds them.
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
      ).pipe(Effect.mapError(storeError("ThreadParticipationStore", "endByAdmission")));
    }),
    end: Effect.fn("ThreadParticipations.end")(function* (departure, endedAt) {
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
      ).pipe(Effect.mapError(storeError("ThreadParticipationStore", "end")));
      if (rows.length !== 1)
        return yield* StoreError.rejected(
          "ThreadParticipationStore",
          "end",
          "Participation is missing, mismatched, or already ended",
        );
    }),
    insert: Effect.fn("ThreadParticipations.insert")(function* (record) {
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
      ).pipe(Effect.mapError(storeError("ThreadParticipationStore", "insert")));
    }),
  };
  return ThreadParticipationStore.make(workspaceId, driver);
});
/**
 * Provides `ThreadParticipationStore.ThreadParticipationStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadParticipationStore.ThreadParticipationStore, make());
