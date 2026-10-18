/**
 * The storage contract for read state, which every storage adapter implements: each person's read
 * positions in threads and the times they last read groups, which `ReadStateProjection` keeps from
 * the journal. `ThreadQuery` and `GroupService` read it to show what is unread.
 *
 * @since 0.1.0
 */

import type * as Store from "@amends-dev/log/Store"
import * as StoreError from "@amends-dev/log/StoreError"
import * as StoreInput from "@amends-dev/log/StoreInput"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as GroupId from "../group/GroupId.ts"
import * as MemoryBinding from "../journal/MemoryBinding.ts"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as ReadState from "./ReadState.ts"

/**
 * Each person's read state, as projected from the journal. Reads honor the caller's transaction,
 * and writes are projection writes, which require it. Advancing keeps the later of the stored and
 * given value. A record for another workspace is rejected.
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
      memberId: MemberId.MemberId,
      threadIds: ReadonlyArray<ThreadId.ThreadId>
    ) => Effect.Effect<ReadonlyArray<ReadState.ThreadPosition>, StoreError.StoreError>
    /** Projection write that advances a member's position in a thread; one at or before it is kept. */
    readonly advanceThread: (
      position: ReadState.ThreadPosition
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /** One member's read times for several groups; groups never read are omitted. */
    readonly getGroupReads: (
      memberId: MemberId.MemberId,
      groupIds: ReadonlyArray<GroupId.GroupId>
    ) => Effect.Effect<ReadonlyArray<ReadState.GroupRead>, StoreError.StoreError>
    /** Projection write that advances when a member last read a group; a time at or before it is kept. */
    readonly advanceGroup: (read: ReadState.GroupRead) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
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
  workspaceId: WorkspaceId.WorkspaceId,
  driver: ReadStateStore["Service"]
): ReadStateStore["Service"] => {
  const read = StoreInput.read("ReadStateStore")
  const write = StoreInput.write("ReadStateStore", WorkspaceId.rejectForeign(workspaceId))
  return {
    getThreadPositions: Effect.fn("ReadStateStore.getThreadPositions")(function* (memberId, threadIds) {
      return yield* driver.getThreadPositions(
        yield* read("getThreadPositions", MemberId.MemberId, memberId),
        yield* read("getThreadPositions", Schema.Array(ThreadId.ThreadId), threadIds)
      )
    }),
    advanceThread: (position) =>
      Effect.flatMap(write("advanceThread", ReadState.ThreadPosition, position), driver.advanceThread),
    getGroupReads: Effect.fn("ReadStateStore.getGroupReads")(function* (memberId, groupIds) {
      return yield* driver.getGroupReads(
        yield* read("getGroupReads", MemberId.MemberId, memberId),
        yield* read("getGroupReads", Schema.Array(GroupId.GroupId), groupIds)
      )
    }),
    advanceGroup: (groupRead) =>
      Effect.flatMap(write("advanceGroup", ReadState.GroupRead, groupRead), driver.advanceGroup)
  }
}

const positionRows = MemoryDatabase.makeRows(Schema.fromJsonString(ReadState.ThreadPosition))
const groupReadRows = MemoryDatabase.makeRows(Schema.fromJsonString(ReadState.GroupRead))

/** Read positions and group read times by member and thread or group, over one workspace's binding. */
const makeMemory = Effect.fn("ReadStateStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* MemoryBinding.MemoryBinding
  const driver: ReadStateStore["Service"] = {
    getThreadPositions: Effect.fn("ReadStateStore.memory.getThreadPositions")(
      function* (memberId, threadIds) {
        const positions = (yield* read).records.of("thread-positions")
        return yield* positionRows.getMany(
          positions,
          [...new Set(threadIds)].map((threadId) => MemoryDatabase.keyOf(memberId, threadId))
        )
      },
      Effect.mapError(StoreError.failed("ReadStateStore", "getThreadPositions"))
    ),
    advanceThread: Effect.fn("ReadStateStore.memory.advanceThread")(
      function* (position) {
        const positions = (yield* write).records.of("thread-positions")
        const key = MemoryDatabase.keyOf(position.memberId, position.threadId)
        const stored = yield* positionRows.get(positions, key)
        if (Option.isSome(stored) && stored.value.readThrough >= position.readThrough) return
        positions.set(key, yield* positionRows.encode(position))
      },
      Effect.mapError(StoreError.failed("ReadStateStore", "advanceThread"))
    ),
    getGroupReads: Effect.fn("ReadStateStore.memory.getGroupReads")(
      function* (memberId, groupIds) {
        const reads = (yield* read).records.of("group-reads")
        return yield* groupReadRows.getMany(
          reads,
          [...new Set(groupIds)].map((groupId) => MemoryDatabase.keyOf(memberId, groupId))
        )
      },
      Effect.mapError(StoreError.failed("ReadStateStore", "getGroupReads"))
    ),
    advanceGroup: Effect.fn("ReadStateStore.memory.advanceGroup")(
      function* (groupRead) {
        const reads = (yield* write).records.of("group-reads")
        const key = MemoryDatabase.keyOf(groupRead.memberId, groupRead.groupId)
        const stored = yield* groupReadRows.get(reads, key)
        if (Option.isSome(stored) && DateTime.isGreaterThanOrEqualTo(stored.value.readAt, groupRead.readAt)) return
        reads.set(key, yield* groupReadRows.encode(groupRead))
      },
      Effect.mapError(StoreError.failed("ReadStateStore", "advanceGroup"))
    )
  }
  return make(workspaceId, driver)
})

/**
 * Provide `ReadStateStore` in process memory, over the workspace's `MemoryBinding.MemoryBinding`:
 * each member's read positions by thread and read times by group. An advance keeps the later of
 * the stored and given value. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ReadStateStore, makeMemory())
