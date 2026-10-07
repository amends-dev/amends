import { Store } from "@amends/core/journal";
import { Thread } from "@amends/core/thread";
import { Turn, TurnStore } from "@amends/core/turn";
import { Member } from "@amends/core/workspace";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Turn.Record));
const rows = Rows.make(Schema.fromJsonString(Turn.Record));

/**
 * Creation time, then how far each accepted input, which a later turn of the same agent on a
 * thread always reaches beyond, then ID in binary order.
 */
const byCreated = (left: Turn.Record, right: Turn.Record) =>
  DateTime.toEpochMillis(left.createdAt) - DateTime.toEpochMillis(right.createdAt) ||
  left.acceptedThroughSequence - right.acceptedThroughSequence ||
  compareBinary(left.id, right.id);

/** Turn records over the current workspace transaction. @category constructors */
export const make = Effect.fn("TurnRecords.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const all = (operation: string) =>
    Effect.gen(function* () {
      return yield* rows.all((yield* read).records.turns);
    }).pipe(Effect.mapError(storeFailure(TurnStore, operation)));
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
  /** An agent has at most one active turn on a thread. */
  const secondActive = (records: ReadonlyArray<Turn.Record>, record: Turn.Record) =>
    Turn.active(record.status) &&
    records.some(
      (other) =>
        other.id !== record.id &&
        Turn.active(other.status) &&
        other.memberId === record.memberId &&
        other.threadId === record.threadId,
    );
  const ofAgent = Effect.fnUntraced(function* (
    operation: string,
    memberInput: Member.Id,
    threadInput: Thread.Id,
  ) {
    const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput).pipe(
      Effect.mapError(storeFailure(TurnStore, operation)),
    );
    const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput).pipe(
      Effect.mapError(storeFailure(TurnStore, operation)),
    );
    return (yield* all(operation))
      .filter((record) => record.memberId === memberId && record.threadId === threadId)
      .toSorted(byCreated);
  });
  return TurnStore.Service.of({
    get: Effect.fn("TurnRecords.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Turn.Id)(input);
        return yield* rows.get((yield* read).records.turns, id);
      },
      Effect.mapError(storeFailure(TurnStore, "get")),
    ),
    findActive: Effect.fn("TurnRecords.findActive")(function* (memberId, threadId) {
      const records = yield* ofAgent("findActive", memberId, threadId);
      return Option.fromUndefinedOr(records.find((record) => Turn.active(record.status)));
    }),
    findLatest: Effect.fn("TurnRecords.findLatest")(function* (memberId, threadId) {
      return Option.fromUndefinedOr((yield* ofAgent("findLatest", memberId, threadId)).at(-1));
    }),
    listActive: Effect.fn("TurnRecords.listActive")(function* (limit) {
      return (yield* all("listActive"))
        .filter((record) => Turn.active(record.status))
        .toSorted(byCreated)
        .slice(0, limit);
    }),
    listActiveByMember: Effect.fn("TurnRecords.listActiveByMember")(function* (memberInput) {
      const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput).pipe(
        Effect.mapError(storeFailure(TurnStore, "listActiveByMember")),
      );
      return (yield* all("listActiveByMember"))
        .filter((record) => record.memberId === memberId && Turn.active(record.status))
        .toSorted(byCreated);
    }),
    insert: Effect.fn("TurnRecords.insert")(function* (input) {
      const record = yield* valid("insert", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(TurnStore, "insert")));
      if (space.records.turns.has(record.id))
        return yield* new TurnStore.Conflict({
          operation: "insert",
          message: "Turn ID already exists",
        });
      const records = yield* rows
        .all(space.records.turns)
        .pipe(Effect.mapError(storeFailure(TurnStore, "insert")));
      if (secondActive(records, record))
        return yield* new TurnStore.Conflict({
          operation: "insert",
          message: "The agent already has an active turn on this thread",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(TurnStore, "insert")));
      space.records.turns.set(record.id, row);
    }),
    update: Effect.fn("TurnRecords.update")(function* (input) {
      const record = yield* valid("update", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(TurnStore, "update")));
      const found = yield* rows
        .get(space.records.turns, record.id)
        .pipe(Effect.mapError(storeFailure(TurnStore, "update")));
      if (Option.isNone(found))
        return yield* new TurnStore.Conflict({
          operation: "update",
          message: "Expected a stored turn",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(TurnStore, "update")));
      space.records.turns.set(record.id, row);
    }),
  });
});

/** Provide turn storage over the caller's binding. @category layers */
export const layer = Layer.effect(TurnStore.Service, make());

export * as TurnRecords from "./turn-records.ts";
