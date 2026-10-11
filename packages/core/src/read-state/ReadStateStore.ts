/**
 * The storage contract for read state, which every storage adapter implements: each person's read
 * positions in threads and the times they last read groups, kept outside the journal.
 * `ReadStateCommand` and `ReadStateService` advance it, and `ThreadQuery` and `GroupService` read
 * it to show what is unread.
 *
 * @since 0.1.0
 */
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import * as GroupId from "../group/GroupId.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as ReadState from "./ReadState.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as Store from "../journal/Store.ts";
import { storeFailure } from "../journal/internal/store-failure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing read state.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ReadStateStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed record, or one for another workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("ReadStateStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Private per-member read state, kept outside the journal: rebuilding projections neither restores
 * nor removes it, so it holds no references a rebuild could break. Reads honor the caller's
 * transaction. Writes join the caller's transaction when there is one and otherwise run on their
 * own, without the workspace's write order; each is atomic. Advancing keeps the later of the stored
 * and requested value. A record for another workspace conflicts; callers write only for members,
 * threads, and groups they have checked.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ReadStateStore extends Context.Service<
  ReadStateStore,
  {
    /** One member's read positions for several threads; unread threads are omitted. */
    readonly getThreadPositions: (
      memberId: MemberId.Id,
      threadIds: ReadonlyArray<ThreadId.Id>,
    ) => Effect.Effect<ReadonlyArray<ReadState.ThreadPosition>, Failure>;
    /** Advance a member's read position in a thread; one at or before the stored one is kept. */
    readonly advanceThread: (
      position: ReadState.ThreadPosition,
    ) => Effect.Effect<void, Failure | Conflict>;
    /** One member's read times for several groups; groups never read are omitted. */
    readonly getGroupReads: (
      memberId: MemberId.Id,
      groupIds: ReadonlyArray<GroupId.Id>,
    ) => Effect.Effect<ReadonlyArray<ReadState.GroupRead>, Failure>;
    /** Advance when a member last read a group; a time at or before the stored one is kept. */
    readonly advanceGroup: (read: ReadState.GroupRead) => Effect.Effect<void, Failure | Conflict>;
  }
>()("@amends-dev/core/read-state/ReadStateStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: ReadStateStore["Service"],
): ReadStateStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    getThreadPositions: Effect.fn("ReadStateStore.getThreadPositions")(
      function* (memberId, threadIds) {
        return yield* driver.getThreadPositions(
          yield* read("getThreadPositions", MemberId.Id, memberId),
          yield* read("getThreadPositions", Schema.Array(ThreadId.Id), threadIds),
        );
      },
    ),
    advanceThread: (position) =>
      Effect.flatMap(
        write("advanceThread", ReadState.ThreadPosition, position),
        driver.advanceThread,
      ),
    getGroupReads: Effect.fn("ReadStateStore.getGroupReads")(function* (memberId, groupIds) {
      return yield* driver.getGroupReads(
        yield* read("getGroupReads", MemberId.Id, memberId),
        yield* read("getGroupReads", Schema.Array(GroupId.Id), groupIds),
      );
    }),
    advanceGroup: (groupRead) =>
      Effect.flatMap(write("advanceGroup", ReadState.GroupRead, groupRead), driver.advanceGroup),
  };
};

/** Keep the later of the stored and requested value. */
const advance = (values: Map<string, number>, key: string, value: number) =>
  values.set(key, Math.max(value, values.get(key) ?? value));

/**
 * Private read state as plain values. Writes keep the later value; they join the caller's
 * transaction when there is one and otherwise apply at once.
 */
const makeMemory = Effect.fn("ReadStateStore.makeMemory")(function* () {
  const { workspaceId, read, join } = yield* Store.MemoryBinding;
  const driver: ReadStateStore["Service"] = {
    getThreadPositions: Effect.fn("ReadStateStore.memory.getThreadPositions")(
      function* (memberId, threadIds) {
        const positions = (yield* read).threadPositions;
        return [...new Set(threadIds)].flatMap((threadId) => {
          const readThrough = positions.get(MemoryDatabase.keyOf(memberId, threadId));
          return readThrough === undefined
            ? []
            : [{ workspaceId, memberId, threadId, readThrough }];
        });
      },
      Effect.mapError(storeFailure(Failure, "getThreadPositions")),
    ),
    advanceThread: Effect.fn("ReadStateStore.memory.advanceThread")(function* (position) {
      const space = yield* join.pipe(Effect.mapError(storeFailure(Failure, "advanceThread")));
      advance(
        space.threadPositions,
        MemoryDatabase.keyOf(position.memberId, position.threadId),
        position.readThrough,
      );
    }),
    getGroupReads: Effect.fn("ReadStateStore.memory.getGroupReads")(
      function* (memberId, groupIds) {
        const times = (yield* read).groupTimes;
        return [...new Set(groupIds)].flatMap((groupId) => {
          const at = times.get(MemoryDatabase.keyOf(memberId, groupId));
          return at === undefined
            ? []
            : [{ workspaceId, memberId, groupId, readAt: DateTime.makeUnsafe(at) }];
        });
      },
      Effect.mapError(storeFailure(Failure, "getGroupReads")),
    ),
    advanceGroup: Effect.fn("ReadStateStore.memory.advanceGroup")(function* (groupRead) {
      const space = yield* join.pipe(Effect.mapError(storeFailure(Failure, "advanceGroup")));
      advance(
        space.groupTimes,
        MemoryDatabase.keyOf(groupRead.memberId, groupRead.groupId),
        DateTime.toEpochMillis(groupRead.readAt),
      );
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `ReadStateStore` in process memory, over the workspace's `Store.MemoryBinding`: each
 * member's private read state, the sequence read through in each thread and when they last read
 * each group, kept beside the projected records so rebuilding projections keeps it. A write keeps
 * the later of the stored and given value; it joins the caller's transaction when there is one and
 * otherwise applies at once, and a commit keeps the later of its own and the committed values.
 * `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ReadStateStore, makeMemory());
