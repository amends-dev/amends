import { Thread } from "../thread/index.ts";
import { Turn, TurnStore } from "../turn/index.ts";
import { Member } from "../workspace/index.ts";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";
import { compareBinary } from "./Rows.ts";

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
  const { workspaceId, read, write } = yield* Binding.Binding;
  const all = (operation: string) =>
    Effect.gen(function* () {
      return yield* rows.all((yield* read).records.of("turns"));
    }).pipe(Effect.mapError(storeFailure(TurnStore, operation)));
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
    memberId: Member.Id,
    threadId: Thread.Id,
  ) {
    return (yield* all(operation))
      .filter((record) => record.memberId === memberId && record.threadId === threadId)
      .toSorted(byCreated);
  });
  const driver: TurnStore.TurnStore["Service"] = {
    get: Effect.fn("TurnRecords.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("turns"), id);
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
    listActiveByMember: Effect.fn("TurnRecords.listActiveByMember")(function* (memberId) {
      return (yield* all("listActiveByMember"))
        .filter((record) => record.memberId === memberId && Turn.active(record.status))
        .toSorted(byCreated);
    }),
    insert: Effect.fn("TurnRecords.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(TurnStore, "insert")));
      if (space.records.of("turns").has(record.id))
        return yield* new TurnStore.Conflict({
          operation: "insert",
          message: "Turn ID already exists",
        });
      const records = yield* rows
        .all(space.records.of("turns"))
        .pipe(Effect.mapError(storeFailure(TurnStore, "insert")));
      if (secondActive(records, record))
        return yield* new TurnStore.Conflict({
          operation: "insert",
          message: "The agent already has an active turn on this thread",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(TurnStore, "insert")));
      space.records.of("turns").set(record.id, row);
    }),
    update: Effect.fn("TurnRecords.update")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(TurnStore, "update")));
      const found = yield* rows
        .get(space.records.of("turns"), record.id)
        .pipe(Effect.mapError(storeFailure(TurnStore, "update")));
      if (Option.isNone(found))
        return yield* new TurnStore.Conflict({
          operation: "update",
          message: "Expected a stored turn",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(TurnStore, "update")));
      space.records.of("turns").set(record.id, row);
    }),
  };
  return TurnStore.make(workspaceId, driver);
});

/** Provide turn storage over the caller's binding. @category layers */
export const layer = Layer.effect(TurnStore.TurnStore, make());
