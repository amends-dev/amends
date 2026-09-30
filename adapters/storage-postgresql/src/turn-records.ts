import { Store } from "@amends/core/journal";
import { Thread } from "@amends/core/thread";
import { Turn, TurnStore } from "@amends/core/turn";
import { Member } from "@amends/core/workspace";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
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
const toRecord = ({ connectionId, model, reasoning, environmentId, ...common }: Row) => ({
  ...common,
  selection:
    connectionId === null || model === null || environmentId === null
      ? null
      : { connectionId, model, reasoning, environmentId },
});
const decode = (rows: ReadonlyArray<Row>) =>
  decodeRows(rows.map(toRecord)).pipe(
    Effect.flatMap((records) => Effect.forEach(records, (record) => validateRecord(record))),
  );
const instant = (value: DateTime.Utc | null) => (value === null ? null : DateTime.toDate(value));
const toRow = ({ selection, ...record }: Turn.Record): typeof turns.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  groupId: record.groupId,
  threadId: record.threadId,
  agentId: record.agentId,
  memberId: record.memberId,
  participationId: record.participationId,
  logAfter: record.logAfter,
  historyFrom: record.historyFrom,
  retryOf: record.retryOf,
  status: record.status,
  inputAfterSequence: record.inputAfterSequence,
  acceptedThroughSequence: record.acceptedThroughSequence,
  incorporatedThroughSequence: record.incorporatedThroughSequence,
  connectionId: selection?.connectionId ?? null,
  model: selection?.model ?? null,
  reasoning: selection?.reasoning ?? null,
  environmentId: selection?.environmentId ?? null,
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
  /** Validate a record for this workspace before writing it. */
  const valid = (operation: string, input: Turn.Record) =>
    Effect.gen(function* () {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(TurnStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new TurnStore.Conflict({
          operation,
          message: "Expected a turn in this workspace",
        });
      return record;
    });
  const ofAgent = (memberId: Member.Id, threadId: Thread.Id) =>
    and(inWorkspace, eq(turns.memberId, memberId), eq(turns.threadId, threadId));
  return TurnStore.Service.of({
    workspaceId,
    get: Effect.fn("TurnRecords.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Turn.Id)(input);
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
      function* (memberInput, threadInput) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput);
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
      function* (memberInput, threadInput) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
        const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput);
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
      function* (memberInput) {
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput);
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
    latestByThread: Effect.fn("TurnRecords.latestByThread")(
      function* (threadInput, perAgent) {
        const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput);
        // Each agent's turns ranked newest first, keeping the first `perAgent` of each.
        const ranked = db
          .select({
            id: turns.id,
            rank: sql<number>`row_number() over (partition by ${turns.memberId} order by ${turns.createdAt} desc, ${turns.acceptedThroughSequence} desc, ${orderedId} desc)`.as(
              "rank",
            ),
          })
          .from(turns)
          .where(and(inWorkspace, eq(turns.threadId, threadId)))
          .as("ranked");
        return yield* guard(
          db
            .select({ turn: turns })
            .from(turns)
            .innerJoin(ranked, eq(ranked.id, turns.id))
            .where(and(inWorkspace, lte(ranked.rank, perAgent)))
            .orderBy(
              sql`${turns.memberId} COLLATE "C"`,
              desc(turns.createdAt),
              desc(turns.acceptedThroughSequence),
              desc(orderedId),
            ),
        ).pipe(Effect.flatMap((rows) => decode(rows.map((row) => row.turn))));
      },
      Effect.mapError(storeFailure(TurnStore, "latestByThread")),
    ),
    listByThread: Effect.fn("TurnRecords.listByThread")(
      function* (threadInput, limit) {
        const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput);
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(and(inWorkspace, eq(turns.threadId, threadId)))
            .orderBy(desc(turns.createdAt), desc(turns.acceptedThroughSequence), desc(orderedId))
            .limit(limit),
        ).pipe(Effect.flatMap(decode));
      },
      Effect.mapError(storeFailure(TurnStore, "listByThread")),
    ),
    insert: Effect.fn("TurnRecords.insert")(function* (input) {
      const record = yield* valid("insert", input);
      yield* guard(db.insert(turns).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(TurnStore, "insert")),
      );
    }),
    update: Effect.fn("TurnRecords.update")(function* (input) {
      const record = yield* valid("update", input);
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
  });
});

/** Provide turn storage over the caller's binding. @category layers */
export const layer = Layer.effect(TurnStore.Service, make());

export * as TurnRecords from "./turn-records.ts";
