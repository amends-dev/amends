/**
 * The storage contract for turns, which every storage adapter implements and `TurnProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that. It enforces that an agent
 * has at most one active turn on each thread.
 *
 * @since 0.1.0
 */
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Store from "../journal/Store.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as Turn from "./Turn.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as Thread from "../thread/Thread.ts";
import * as Member from "../workspace/Member.ts";
import { storeFailure } from "../journal/internal/store-failure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing turns.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("TurnStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, a second
 * active turn for the same agent and thread, or a missing turn.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("TurnStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The turn store, bound to one workspace by the host: what a storage adapter implements for
 * turns. Reads honor an existing transaction; writes require one.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class TurnStore extends Context.Service<
  TurnStore,
  {
    /** The turn, if stored. */
    readonly get: (id: Turn.Id) => Effect.Effect<Option.Option<Turn.Turn>, Failure>;
    /** The agent's active turn on the thread: queued, running, or cancelling. */
    readonly findActive: (
      memberId: MemberId.Id,
      threadId: ThreadId.Id,
    ) => Effect.Effect<Option.Option<Turn.Turn>, Failure>;
    /**
     * The agent's most recent turn on the thread, active or finished: by creation, then by how far
     * its accepted input reaches, which a later turn always extends.
     */
    readonly findLatest: (
      memberId: MemberId.Id,
      threadId: ThreadId.Id,
    ) => Effect.Effect<Option.Option<Turn.Turn>, Failure>;
    /** Every active turn in the workspace, oldest first, at most `limit`. */
    readonly listActive: (limit: number) => Effect.Effect<ReadonlyArray<Turn.Turn>, Failure>;
    /** The agent's active turns, one at most per thread, oldest first. */
    readonly listActiveByMember: (
      memberId: MemberId.Id,
    ) => Effect.Effect<ReadonlyArray<Turn.Turn>, Failure>;
    /**
     * Reject reused IDs and a second active turn for the same agent
     * and thread. Never upsert.
     */
    readonly insert: (
      record: Turn.Turn,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** Replace a stored turn; a missing record conflicts. */
    readonly update: (
      record: Turn.Turn,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/turn/TurnStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: TurnStore["Service"],
): TurnStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Turn.Id, id), driver.get),
    findActive: Effect.fn("TurnStore.findActive")(function* (memberId, threadId) {
      return yield* driver.findActive(
        yield* read("findActive", MemberId.Id, memberId),
        yield* read("findActive", ThreadId.Id, threadId),
      );
    }),
    findLatest: Effect.fn("TurnStore.findLatest")(function* (memberId, threadId) {
      return yield* driver.findLatest(
        yield* read("findLatest", MemberId.Id, memberId),
        yield* read("findLatest", ThreadId.Id, threadId),
      );
    }),
    listActive: (limit) =>
      Effect.flatMap(read("listActive", Schema.Natural, limit), driver.listActive),
    listActiveByMember: (memberId) =>
      Effect.flatMap(read("listActiveByMember", MemberId.Id, memberId), driver.listActiveByMember),
    insert: (record) => Effect.flatMap(write("insert", Turn.Turn, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Turn.Turn, record), driver.update),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Turn.Turn));

/**
 * Creation time, then how far each accepted input, which a later turn of the same agent on a
 * thread always reaches beyond, then ID in binary order.
 */
const byCreated = (left: Turn.Turn, right: Turn.Turn) =>
  DateTime.toEpochMillis(left.createdAt) - DateTime.toEpochMillis(right.createdAt) ||
  left.acceptedThroughSequence - right.acceptedThroughSequence ||
  MemoryDatabase.compareBinary(left.id, right.id);

/**
 * Turn records over the current workspace transaction.
 */
const makeMemory = Effect.fn("TurnStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const all = (operation: string) =>
    Effect.gen(function* () {
      return yield* rows.all((yield* read).records.of("turns"));
    }).pipe(Effect.mapError(storeFailure(Failure, operation)));
  /** An agent has at most one active turn on a thread. */
  const secondActive = (records: ReadonlyArray<Turn.Turn>, record: Turn.Turn) =>
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
  const driver: TurnStore["Service"] = {
    get: Effect.fn("TurnStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("turns"), id);
      },
      Effect.mapError(storeFailure(Failure, "get")),
    ),
    findActive: Effect.fn("TurnStore.memory.findActive")(function* (memberId, threadId) {
      const records = yield* ofAgent("findActive", memberId, threadId);
      return Option.fromUndefinedOr(records.find((record) => Turn.active(record.status)));
    }),
    findLatest: Effect.fn("TurnStore.memory.findLatest")(function* (memberId, threadId) {
      return Option.fromUndefinedOr((yield* ofAgent("findLatest", memberId, threadId)).at(-1));
    }),
    listActive: Effect.fn("TurnStore.memory.listActive")(function* (limit) {
      return (yield* all("listActive"))
        .filter((record) => Turn.active(record.status))
        .toSorted(byCreated)
        .slice(0, limit);
    }),
    listActiveByMember: Effect.fn("TurnStore.memory.listActiveByMember")(function* (memberId) {
      return (yield* all("listActiveByMember"))
        .filter((record) => record.memberId === memberId && Turn.active(record.status))
        .toSorted(byCreated);
    }),
    insert: Effect.fn("TurnStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (space.records.of("turns").has(record.id))
        return yield* new Conflict({
          operation: "insert",
          message: "Turn ID already exists",
        });
      const records = yield* rows
        .all(space.records.of("turns"))
        .pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (secondActive(records, record))
        return yield* new Conflict({
          operation: "insert",
          message: "The agent already has an active turn on this thread",
        });
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("turns").set(record.id, row);
    }),
    update: Effect.fn("TurnStore.memory.update")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "update")));
      const found = yield* rows
        .get(space.records.of("turns"), record.id)
        .pipe(Effect.mapError(storeFailure(Failure, "update")));
      if (Option.isNone(found))
        return yield* new Conflict({
          operation: "update",
          message: "Expected a stored turn",
        });
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "update")));
      space.records.of("turns").set(record.id, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `TurnStore` in process memory, over the workspace's `Store.MemoryBinding`. It keeps what
 * the contract leaves to storage: a reused ID conflicts, and so does a second active turn of one
 * agent on one thread; an update of a missing turn conflicts. An agent's turns on a thread order by
 * creation time, then how far each accepted input, then ID. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(TurnStore, makeMemory());
