/**
 * The storage contract for follows, which every storage adapter implements and
 * `GroupFollowProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */

import type * as Store from "@amends-dev/log/Store"
import * as StoreError from "@amends-dev/log/StoreError"
import * as StoreInput from "@amends-dev/log/StoreInput"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import type * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as MemoryBinding from "../journal/MemoryBinding.ts"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as GroupFollow from "./GroupFollow.ts"
import * as GroupId from "./GroupId.ts"
import * as GroupMembership from "./GroupMembership.ts"

/**
 * The follow store, bound to one workspace by the host: what a storage adapter implements for
 * follows.
 *
 * `make` builds the store over a driver of the same shape. It checks every input against its
 * schema, and a record against the workspace, before the driver sees it, so a driver keeps only
 * what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class GroupFollowStore extends Context.Service<
  GroupFollowStore,
  {
    /** The follow, active or ended, if stored. */
    readonly get: (
      id: GroupFollow.GroupFollowId
    ) => Effect.Effect<Option.Option<GroupFollow.GroupFollow>, StoreError.StoreError>
    /** The active follow of one group admission; None when that admission follows nothing. */
    readonly findActive: (
      groupMembershipId: GroupMembership.GroupMembershipId
    ) => Effect.Effect<Option.Option<GroupFollow.GroupFollow>, StoreError.StoreError>
    /** The active follows of several admissions in one read; admissions without one are omitted. */
    readonly findActiveMany: (
      groupMembershipIds: ReadonlyArray<GroupMembership.GroupMembershipId>
    ) => Effect.Effect<ReadonlyArray<GroupFollow.GroupFollow>, StoreError.StoreError>
    /** Active follows of a group, in stable ID order, which `ThreadQuery.followers` reads. */
    readonly listActiveByGroup: (
      groupId: GroupId.GroupId
    ) => Effect.Effect<ReadonlyArray<GroupFollow.GroupFollow>, StoreError.StoreError>
    /**
     * Insert an active follow. Reject reused IDs and a second active follow for one admission. The
     * admission is recorded as given: the application checks that it is current and belongs to the
     * group and member.
     */
    readonly insert: (record: GroupFollow.GroupFollow) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /** End exactly the addressed active follow; mismatched or ended follows conflict. */
    readonly end: (
      ending: GroupFollow.Ending,
      endedAt: DateTime.Utc
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
  }
>()("@amends-dev/core/group/GroupFollowStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.WorkspaceId,
  driver: GroupFollowStore["Service"]
): GroupFollowStore["Service"] => {
  const read = StoreInput.read("GroupFollowStore")
  const write = StoreInput.write("GroupFollowStore", WorkspaceId.rejectForeign(workspaceId))
  return {
    get: (id) => Effect.flatMap(read("get", GroupFollow.GroupFollowId, id), driver.get),
    findActive: (groupMembershipId) =>
      Effect.flatMap(read("findActive", GroupMembership.GroupMembershipId, groupMembershipId), driver.findActive),
    findActiveMany: (groupMembershipIds) =>
      Effect.flatMap(
        read("findActiveMany", Schema.Array(GroupMembership.GroupMembershipId), groupMembershipIds),
        driver.findActiveMany
      ),
    listActiveByGroup: (groupId) =>
      Effect.flatMap(read("listActiveByGroup", GroupId.GroupId, groupId), driver.listActiveByGroup),
    insert: (record) =>
      write("insert", GroupFollow.GroupFollow, record).pipe(
        Effect.filterOrFail(
          (record) => record.status === "active" && record.endedAt === null,
          () => StoreError.rejected("GroupFollowStore", "insert", "Expected an active follow")
        ),
        Effect.flatMap(driver.insert)
      ),
    end: Effect.fn("GroupFollowStore.end")(function* (ending, endedAt) {
      return yield* driver.end(
        yield* write("end", GroupFollow.Ending, ending),
        yield* write("end", Schema.DateTimeUtc, endedAt)
      )
    })
  }
}

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(GroupFollow.GroupFollow))

/**
 * Group follows, active and ended; one active follow per group admission.
 */
const makeMemory = Effect.fn("GroupFollowStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* MemoryBinding.MemoryBinding
  const active = Effect.flatMap(read, (space) => rows.all(space.records.of("groupFollows"))).pipe(
    Effect.map((records) => records.filter((record) => record.status === "active"))
  )
  const driver: GroupFollowStore["Service"] = {
    get: Effect.fn("GroupFollowStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("groupFollows"), id)
      },
      Effect.mapError(StoreError.failed("GroupFollowStore", "get"))
    ),
    findActive: Effect.fn("GroupFollowStore.memory.findActive")(
      function* (id) {
        return Array.findFirst(yield* active, (record) => record.groupMembershipId === id)
      },
      Effect.mapError(StoreError.failed("GroupFollowStore", "findActive"))
    ),
    findActiveMany: Effect.fn("GroupFollowStore.memory.findActiveMany")(
      function* (input) {
        const ids = new Set(input)
        if (ids.size === 0) return []
        return (yield* active).filter((record) => ids.has(record.groupMembershipId))
      },
      Effect.mapError(StoreError.failed("GroupFollowStore", "findActiveMany"))
    ),
    listActiveByGroup: Effect.fn("GroupFollowStore.memory.listActiveByGroup")(
      function* (groupId) {
        return (yield* active)
          .filter((record) => record.groupId === groupId)
          .toSorted((left, right) => MemoryDatabase.compareBinary(left.id, right.id))
      },
      Effect.mapError(StoreError.failed("GroupFollowStore", "listActiveByGroup"))
    ),
    insert: Effect.fn("GroupFollowStore.memory.insert")(
      function* (record) {
        const space = yield* write
        const follows = yield* rows.all(space.records.of("groupFollows"))
        if (
          space.records.of("groupFollows").has(record.id) ||
          follows.some((follow) => follow.groupMembershipId === record.groupMembershipId && follow.status === "active")
        )
          return yield* StoreError.rejected(
            "GroupFollowStore",
            "insert",
            "Follow ID reused, or the admission already follows"
          )
        const row = yield* rows.encode(record)
        space.records.of("groupFollows").set(record.id, row)
      },
      Effect.mapError(StoreError.failed("GroupFollowStore", "insert"))
    ),
    end: Effect.fn("GroupFollowStore.memory.end")(
      function* (ending, endedAt) {
        const space = yield* write
        const current = yield* rows.get(space.records.of("groupFollows"), ending.followId)
        if (
          Option.isNone(current) ||
          current.value.groupId !== ending.groupId ||
          current.value.memberId !== ending.memberId ||
          current.value.status !== "active"
        )
          return yield* StoreError.rejected(
            "GroupFollowStore",
            "end",
            "Follow is missing, mismatched, or already ended"
          )
        const row = yield* rows.encode({ ...current.value, status: "ended", endedAt })
        space.records.of("groupFollows").set(ending.followId, row)
      },
      Effect.mapError(StoreError.failed("GroupFollowStore", "end"))
    )
  }
  return make(workspaceId, driver)
})

/**
 * Provide `GroupFollowStore` in process memory, over the workspace's `MemoryBinding.MemoryBinding`. It
 * keeps what the contract leaves to storage: a reused ID is rejected, and so is a second active
 * follow for one group admission; ending a follow is rejected unless it is stored, active, and of
 * the group and member named. An ended follow keeps its row. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(GroupFollowStore, makeMemory())
