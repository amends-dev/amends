import { Thread } from "@amends-dev/core/thread";
import { Turn, TurnStore } from "@amends-dev/core/turn";
import { Member } from "@amends-dev/core/workspace";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { turns } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Turn.Record));
const Instant = Schema.NullOr(Schema.DateTimeUtcFromDate);
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...Turn.Record.fields,
      createdAt: Schema.DateTimeUtcFromDate,
      startedAt: Instant,
      finishedAt: Instant,
    }),
  ),
);
type Row = typeof turns.$inferSelect;
/** The record a row stores, before its fields are checked. */
const toRecord = ({
  retryOf,
  retriedBy,
  harnessConnectionId,
  modelConnectionId,
  modelId,
  modelEffort,
  sandboxConnectionId,
  ...common
}: Row) => ({
  ...common,
  retry: retryOf === null || retriedBy === null ? null : { of: retryOf, by: retriedBy },
  selection:
    harnessConnectionId === null || modelConnectionId === null || modelId === null
      ? null
      : {
          harness: { connectionId: harnessConnectionId },
          model: {
            connectionId: modelConnectionId,
            id: modelId,
            ...(modelEffort === null ? {} : { effort: modelEffort }),
          },
          sandbox: sandboxConnectionId === null ? null : { connectionId: sandboxConnectionId },
        },
});
const decode = (rows: ReadonlyArray<Row>) =>
  decodeRows(rows.map(toRecord)).pipe(
    Effect.flatMap((records) => Effect.forEach(records, (record) => validateRecord(record))),
  );
const instant = (value: DateTime.Utc | null) => (value === null ? null : DateTime.toDate(value));
const toRow = ({ selection, retry, ...record }: Turn.Record): typeof turns.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  groupId: record.groupId,
  threadId: record.threadId,
  agentId: record.agentId,
  memberId: record.memberId,
  participationId: record.participationId,
  retryOf: retry?.of ?? null,
  retriedBy: retry?.by ?? null,
  status: record.status,
  acceptedThroughSequence: record.acceptedThroughSequence,
  logAfter: record.logAfter,
  harnessConnectionId: selection?.harness.connectionId ?? null,
  modelConnectionId: selection?.model.connectionId ?? null,
  modelId: selection?.model.id ?? null,
  modelEffort: selection?.model.effort ?? null,
  sandboxConnectionId: selection?.sandbox?.connectionId ?? null,
  messageIds: [...record.messageIds],
  failure: record.failure,
  cancelReason: record.cancelReason,
  createdAt: DateTime.toDate(record.createdAt),
  startedAt: instant(record.startedAt),
  finishedAt: instant(record.finishedAt),
});
const activeStatuses = ["queued", "running", "cancelling"] as const;

/** Turn records in the workspace's database. @category constructors */
export const make = Effect.fn("TurnRecords.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(turns.workspaceId, workspaceId);
  const orderedId = sql`${turns.id} COLLATE "C"`;
  const ofAgent = (memberId: Member.Id, threadId: Thread.Id) =>
    and(inWorkspace, eq(turns.memberId, memberId), eq(turns.threadId, threadId));
  const driver: TurnStore.Interface = {
    get: Effect.fn("TurnRecords.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(and(inWorkspace, eq(turns.id, id))),
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(TurnStore, "get")),
    ),
    findActive: Effect.fn("TurnRecords.findActive")(
      function* (memberId, threadId) {
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(and(ofAgent(memberId, threadId), inArray(turns.status, [...activeStatuses]))),
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(TurnStore, "findActive")),
    ),
    findLatest: Effect.fn("TurnRecords.findLatest")(
      function* (memberId, threadId) {
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(ofAgent(memberId, threadId))
            .orderBy(desc(turns.createdAt), desc(turns.acceptedThroughSequence), desc(orderedId))
            .limit(1),
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(TurnStore, "findLatest")),
    ),
    listActive: Effect.fn("TurnRecords.listActive")(
      function* (limit) {
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(and(inWorkspace, inArray(turns.status, [...activeStatuses])))
            .orderBy(asc(turns.createdAt), asc(turns.acceptedThroughSequence), asc(orderedId))
            .limit(limit),
        ).pipe(Effect.flatMap(decode));
      },
      Effect.mapError(storeFailure(TurnStore, "listActive")),
    ),
    listActiveByMember: Effect.fn("TurnRecords.listActiveByMember")(
      function* (memberId) {
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(
              and(
                inWorkspace,
                eq(turns.memberId, memberId),
                inArray(turns.status, [...activeStatuses]),
              ),
            )
            .orderBy(asc(turns.createdAt), asc(turns.acceptedThroughSequence), asc(orderedId)),
        ).pipe(Effect.flatMap(decode));
      },
      Effect.mapError(storeFailure(TurnStore, "listActiveByMember")),
    ),
    insert: Effect.fn("TurnRecords.insert")(function* (record) {
      yield* guard(db.insert(turns).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(TurnStore, "insert")),
      );
    }),
    update: Effect.fn("TurnRecords.update")(function* (record) {
      const updated = yield* guard(
        db
          .update(turns)
          .set(toRow(record))
          .where(and(inWorkspace, eq(turns.id, record.id)))
          .returning({ id: turns.id }),
        true,
      ).pipe(Effect.mapError(storeError(TurnStore, "update")));
      if (updated.length === 0)
        return yield* new TurnStore.Conflict({
          operation: "update",
          message: "Expected a stored turn",
        });
    }),
  };
  return TurnStore.make(workspaceId, driver);
});

/** Provide turn storage over the caller's binding. @category layers */
export const layer = Layer.effect(TurnStore.Service, make());

export * as TurnRecords from "./turn-records.ts";
