/**
 * The storage contract for read state, which every storage adapter implements: each person's read
 * positions in threads and the times they last read groups, kept outside the journal. Marking a
 * thread read also settles the person's notifications from it. `ReadStateService` advances it, as
 * do `ThreadService` and `ThreadMessageService` for an author, and `ThreadQuery` and
 * `GroupService` read it to show what is unread.
 *
 * @since 0.1.0
 */

import * as StoreError from "@amends-dev/log/StoreError"
import * as StoreInput from "@amends-dev/log/StoreInput"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as GroupId from "../group/GroupId.ts"
import * as MemoryBinding from "../journal/MemoryBinding.ts"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as Notification from "../notification/Notification.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as ReadState from "./ReadState.ts"

/**
 * Private per-member read state, kept outside the journal: rebuilding projections neither restores
 * nor removes it, so it holds no references a rebuild could break. Reads honor the caller's
 * transaction. Writes join the caller's transaction when there is one and otherwise run on their
 * own, without the workspace's write order; each is atomic. Advancing keeps the later of the stored
 * and requested value. A record for another workspace is rejected; callers write only for members,
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
      memberId: MemberId.MemberId,
      threadIds: ReadonlyArray<ThreadId.ThreadId>
    ) => Effect.Effect<ReadonlyArray<ReadState.ThreadPosition>, StoreError.StoreError>
    /**
     * Mark a thread read through a position, in one write: the member's read position advances,
     * one at or before the stored one being kept, and their pending notifications from the
     * thread's activity up to it become seen at `seenAt`. A notification seen before keeps its
     * first time.
     */
    readonly markThreadRead: (
      position: ReadState.ThreadPosition,
      seenAt: DateTime.Utc
    ) => Effect.Effect<void, StoreError.StoreError>
    /** One member's read times for several groups; groups never read are omitted. */
    readonly getGroupReads: (
      memberId: MemberId.MemberId,
      groupIds: ReadonlyArray<GroupId.GroupId>
    ) => Effect.Effect<ReadonlyArray<ReadState.GroupRead>, StoreError.StoreError>
    /** Advance when a member last read a group; a time at or before the stored one is kept. */
    readonly advanceGroup: (read: ReadState.GroupRead) => Effect.Effect<void, StoreError.StoreError>
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
    markThreadRead: Effect.fn("ReadStateStore.markThreadRead")(function* (position, seenAt) {
      return yield* driver.markThreadRead(
        yield* write("markThreadRead", ReadState.ThreadPosition, position),
        yield* write("markThreadRead", Schema.DateTimeUtc, seenAt)
      )
    }),
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

/** Keep the later of the stored and requested value. */
const advance = (values: Map<string, number>, key: string, value: number) =>
  values.set(key, Math.max(value, values.get(key) ?? value))

/** Notifications as `NotificationStore` keeps them in memory. */
const notificationRows = MemoryDatabase.makeRows(Schema.fromJsonString(Notification.Notification))

/** Is this the member's pending notification from the thread's activity up to the position? */
const isSettledBy = (record: Notification.Notification, position: ReadState.ThreadPosition) =>
  Notification.Recipient.isAnyOf(["Human"])(record.recipient) &&
  record.recipient.memberId === position.memberId &&
  Notification.State.isAnyOf(["Pending"])(record.state) &&
  record.thread !== undefined &&
  record.thread.threadId === position.threadId &&
  record.thread.sequence <= position.readThrough

/**
 * Private read state as plain values. Writes keep the later value; they join the caller's
 * transaction when there is one and otherwise apply at once.
 */
const makeMemory = Effect.fn("ReadStateStore.makeMemory")(function* () {
  const { workspaceId, read, join, exclusive } = yield* MemoryBinding.MemoryBinding
  const driver: ReadStateStore["Service"] = {
    getThreadPositions: Effect.fn("ReadStateStore.memory.getThreadPositions")(
      function* (memberId, threadIds) {
        const positions = (yield* read).threadPositions
        return [...new Set(threadIds)].flatMap((threadId) => {
          const readThrough = positions.get(MemoryDatabase.keyOf(memberId, threadId))
          return readThrough === undefined ? [] : [{ workspaceId, memberId, threadId, readThrough }]
        })
      },
      Effect.mapError(StoreError.failed("ReadStateStore", "getThreadPositions"))
    ),
    markThreadRead: Effect.fn("ReadStateStore.memory.markThreadRead")(
      function* (position, seenAt) {
        // The notifications are projected records, so outside a transaction this holds the
        // workspace's writer, as marking one seen does, and no commit lands in between.
        yield* exclusive((space) =>
          Effect.gen(function* () {
            const notifications = space.records.of("notifications")
            for (const record of yield* notificationRows.all(notifications)) {
              if (!isSettledBy(record, position)) continue
              const seen = Object.assign({}, record, {
                state: Notification.State.cases.Seen.make({ seenAt })
              })
              notifications.set(record.id, yield* notificationRows.encode(seen))
              space.notificationsSeen.set(record.id, DateTime.toEpochMillis(seenAt))
            }
            advance(
              space.threadPositions,
              MemoryDatabase.keyOf(position.memberId, position.threadId),
              position.readThrough
            )
          })
        )
      },
      Effect.mapError(StoreError.failed("ReadStateStore", "markThreadRead"))
    ),
    getGroupReads: Effect.fn("ReadStateStore.memory.getGroupReads")(
      function* (memberId, groupIds) {
        const times = (yield* read).groupTimes
        return [...new Set(groupIds)].flatMap((groupId) => {
          const at = times.get(MemoryDatabase.keyOf(memberId, groupId))
          return at === undefined ? [] : [{ workspaceId, memberId, groupId, readAt: DateTime.makeUnsafe(at) }]
        })
      },
      Effect.mapError(StoreError.failed("ReadStateStore", "getGroupReads"))
    ),
    advanceGroup: Effect.fn("ReadStateStore.memory.advanceGroup")(
      function* (groupRead) {
        const space = yield* join
        advance(
          space.groupTimes,
          MemoryDatabase.keyOf(groupRead.memberId, groupRead.groupId),
          DateTime.toEpochMillis(groupRead.readAt)
        )
      },
      Effect.mapError(StoreError.failed("ReadStateStore", "advanceGroup"))
    )
  }
  return make(workspaceId, driver)
})

/**
 * Provide `ReadStateStore` in process memory, over the workspace's `MemoryBinding.MemoryBinding`: each
 * member's private read state, the sequence read through in each thread and when they last read
 * each group, kept beside the projected records so rebuilding projections keeps it. A write keeps
 * the later of the stored and given value; it joins the caller's transaction when there is one and
 * otherwise applies at once, and a commit keeps the later of its own and the committed values.
 * Marking a thread read also marks the member's notifications from it seen, as
 * `NotificationStore`'s `markSeen` does, holding the workspace's writer outside a transaction.
 * `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ReadStateStore, makeMemory())
