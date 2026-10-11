/**
 * The storage contract for follows, which every storage adapter implements and
 * `GroupFollowProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Array, Context, Effect, Layer, Option, Schema } from "effect";
import type { DateTime } from "effect";
import * as Store from "../journal/Store.ts";
import * as GroupId from "./GroupId.ts";
import * as GroupMembership from "./GroupMembership.ts";
import * as GroupFollow from "./GroupFollow.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import { storeFailure } from "../journal/internal/storeFailure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing follows.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("GroupFollowStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, a second
 * active follow for one admission, or a missing, ended, or mismatched follow.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("GroupFollowStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The follow store, bound to one workspace by the host.
 *
 * What a storage adapter implements for follows.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class GroupFollowStore extends Context.Service<
  GroupFollowStore,
  {
    /** The follow, active or ended, if stored. */
    readonly get: (
      id: GroupFollow.Id,
    ) => Effect.Effect<Option.Option<GroupFollow.GroupFollow>, Failure>;
    /** The active follow of one group admission; None when that admission follows nothing. */
    readonly findActive: (
      groupMembershipId: GroupMembership.Id,
    ) => Effect.Effect<Option.Option<GroupFollow.GroupFollow>, Failure>;
    /** The active follows of several admissions in one read; admissions without one are omitted. */
    readonly findActiveMany: (
      groupMembershipIds: ReadonlyArray<GroupMembership.Id>,
    ) => Effect.Effect<ReadonlyArray<GroupFollow.GroupFollow>, Failure>;
    /** Active follows of a group, in stable ID order, which `ThreadQuery.followers` reads. */
    readonly listActiveByGroup: (
      groupId: GroupId.Id,
    ) => Effect.Effect<ReadonlyArray<GroupFollow.GroupFollow>, Failure>;
    /**
     * Insert an active follow. Reject reused IDs and a second active follow for one admission. The
     * admission is recorded as given: the application checks that it is current and belongs to the
     * group and member.
     */
    readonly insert: (
      record: GroupFollow.GroupFollow,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** End exactly the addressed active follow; mismatched or ended follows conflict. */
    readonly end: (
      ending: GroupFollow.Ending,
      endedAt: DateTime.Utc,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
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
  workspaceId: WorkspaceId.Id,
  driver: GroupFollowStore["Service"],
): GroupFollowStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", GroupFollow.Id, id), driver.get),
    findActive: (groupMembershipId) =>
      Effect.flatMap(read("findActive", GroupMembership.Id, groupMembershipId), driver.findActive),
    findActiveMany: (groupMembershipIds) =>
      Effect.flatMap(
        read("findActiveMany", Schema.Array(GroupMembership.Id), groupMembershipIds),
        driver.findActiveMany,
      ),
    listActiveByGroup: (groupId) =>
      Effect.flatMap(read("listActiveByGroup", GroupId.Id, groupId), driver.listActiveByGroup),
    insert: (record) =>
      write("insert", GroupFollow.GroupFollow, record).pipe(
        Effect.filterOrFail(
          (record) => record.status === "active" && record.endedAt === null,
          () => new Conflict({ operation: "insert", message: "Expected an active follow" }),
        ),
        Effect.flatMap(driver.insert),
      ),
    end: Effect.fn("GroupFollowStore.end")(function* (ending, endedAt) {
      return yield* driver.end(
        yield* write("end", GroupFollow.Ending, ending),
        yield* write("end", Schema.DateTimeUtc, endedAt),
      );
    }),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(GroupFollow.GroupFollow));

/**
 * Group follows, active and ended; one active follow per group admission.
 */
const makeMemory = Effect.fn("GroupFollowStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const active = Effect.flatMap(read, (space) => rows.all(space.records.of("groupFollows"))).pipe(
    Effect.map((records) => records.filter((record) => record.status === "active")),
  );
  const driver: GroupFollowStore["Service"] = {
    get: Effect.fn("GroupFollowStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("groupFollows"), id);
      },
      Effect.mapError(storeFailure(Failure, "get")),
    ),
    findActive: Effect.fn("GroupFollowStore.memory.findActive")(
      function* (id) {
        return Array.findFirst(yield* active, (record) => record.groupMembershipId === id);
      },
      Effect.mapError(storeFailure(Failure, "findActive")),
    ),
    findActiveMany: Effect.fn("GroupFollowStore.memory.findActiveMany")(
      function* (input) {
        const ids = new Set(input);
        if (ids.size === 0) return [];
        return (yield* active).filter((record) => ids.has(record.groupMembershipId));
      },
      Effect.mapError(storeFailure(Failure, "findActiveMany")),
    ),
    listActiveByGroup: Effect.fn("GroupFollowStore.memory.listActiveByGroup")(
      function* (groupId) {
        return (yield* active)
          .filter((record) => record.groupId === groupId)
          .toSorted((left, right) => MemoryDatabase.compareBinary(left.id, right.id));
      },
      Effect.mapError(storeFailure(Failure, "listActiveByGroup")),
    ),
    insert: Effect.fn("GroupFollowStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      const follows = yield* rows
        .all(space.records.of("groupFollows"))
        .pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (
        space.records.of("groupFollows").has(record.id) ||
        follows.some(
          (follow) =>
            follow.groupMembershipId === record.groupMembershipId && follow.status === "active",
        )
      )
        return yield* new Conflict({
          operation: "insert",
          message: "Follow ID reused, or the admission already follows",
        });
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("groupFollows").set(record.id, row);
    }),
    end: Effect.fn("GroupFollowStore.memory.end")(function* (ending, endedAt) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "end")));
      const current = yield* rows
        .get(space.records.of("groupFollows"), ending.followId)
        .pipe(Effect.mapError(storeFailure(Failure, "end")));
      if (
        Option.isNone(current) ||
        current.value.groupId !== ending.groupId ||
        current.value.memberId !== ending.memberId ||
        current.value.status !== "active"
      )
        return yield* new Conflict({
          operation: "end",
          message: "Follow is missing, mismatched, or already ended",
        });
      const row = yield* rows
        .encode({ ...current.value, status: "ended", endedAt })
        .pipe(Effect.mapError(storeFailure(Failure, "end")));
      space.records.of("groupFollows").set(ending.followId, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `GroupFollowStore` in process memory, over the workspace's `Store.MemoryBinding`. It
 * keeps what the contract leaves to storage: a reused ID conflicts, and so does a second active
 * follow for one group admission; ending a follow conflicts unless it is stored, active, and of the
 * group and member named. An ended follow keeps its row. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(GroupFollowStore, makeMemory());
