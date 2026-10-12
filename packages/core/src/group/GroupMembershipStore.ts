/**
 * The storage contract for admissions, which every storage adapter implements and
 * `GroupMembershipProjection` writes. Reads honor the caller's transaction when there is one;
 * writes require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Array, Context, Effect, Layer, Option, Schema } from "effect";
import * as Store from "../journal/Store.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as Group from "./Group.ts";
import * as GroupId from "./GroupId.ts";
import * as GroupMembership from "./GroupMembership.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";
import * as StoreError from "../journal/StoreError.ts";

/**
 * The admission store, bound to one workspace by the host.
 *
 * What a storage adapter implements for admissions, which keep their workspace-member references.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class GroupMembershipStore extends Context.Service<
  GroupMembershipStore,
  {
    /** The admission, active or ended, if stored. */
    readonly get: (
      id: GroupMembership.Id,
    ) => Effect.Effect<Option.Option<GroupMembership.GroupMembership>, StoreError.StoreError>;
    /**
     * Find several admissions, active or ended, in one read. Absent IDs are omitted and each found
     * record appears once; order is unspecified, so callers index results by ID. An empty request
     * reads nothing.
     */
    readonly getMany: (
      ids: ReadonlyArray<GroupMembership.Id>,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.GroupMembership>, StoreError.StoreError>;
    /** The member's active admission to the group, if any: at most one is active at a time. */
    readonly findActive: (
      groupId: GroupId.Id,
      memberId: MemberId.Id,
    ) => Effect.Effect<Option.Option<GroupMembership.GroupMembership>, StoreError.StoreError>;
    /**
     * The group's active admissions of these members, in one read. Each found record appears once;
     * order is unspecified, so callers index results by member. An empty request reads nothing.
     */
    readonly findActiveMany: (
      groupId: GroupId.Id,
      memberIds: ReadonlyArray<MemberId.Id>,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.GroupMembership>, StoreError.StoreError>;
    /**
     * How many active admissions each of several groups has, and whether this member holds one, in
     * one read. Groups without any are omitted; order is unspecified. An empty request reads
     * nothing.
     */
    readonly summarize: (
      groupIds: ReadonlyArray<GroupId.Id>,
      memberId: MemberId.Id,
    ) => Effect.Effect<ReadonlyArray<Group.Summary>, StoreError.StoreError>;
    /**
     * Every admission of a group, active or ended, in stable ID order. A history read for
     * inspection; operations use the bounded reads.
     */
    readonly listByGroup: (
      groupId: GroupId.Id,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.GroupMembership>, StoreError.StoreError>;
    /** A page of a group's active admissions in binary admission-ID order, after the cursor. */
    readonly pageActiveByGroup: (
      groupId: GroupId.Id,
      options: GroupMembership.ListOptions,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.GroupMembership>, StoreError.StoreError>;
    /** A page of a member's active admissions in binary group-ID order, after the group cursor. */
    readonly pageActiveByMember: (
      memberId: MemberId.Id,
      options: GroupMembership.ByMemberOptions,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.GroupMembership>, StoreError.StoreError>;
    /**
     * A member's active admissions, in stable admission-ID order, which `MemberService.remove`
     * ends when the member is removed from the workspace. Internal only.
     */
    readonly listActiveByMember: (
      memberId: MemberId.Id,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.GroupMembership>, StoreError.StoreError>;
    /**
     * Insert an active admission. Reject reused admission IDs and duplicate active group/member
     * pairs. The group and member are recorded as given: the
     * application checks that they exist and the member is current.
     */
    readonly insert: (
      record: GroupMembership.GroupMembership,
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>;
    /**
     * End the specified active admission, preserving its other fields. Reject missing or ended
     * admissions and mismatched group/member references.
     * Reason and attribution remain in the journal; replay never checks current authority.
     */
    readonly markRemoved: (
      removal: GroupMembership.Removal,
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>;
  }
>()("@amends-dev/core/group/GroupMembershipStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: GroupMembershipStore["Service"],
): GroupMembershipStore["Service"] => {
  const read = StoreInput.read("GroupMembershipStore");
  const write = StoreInput.write("GroupMembershipStore", workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", GroupMembership.Id, id), driver.get),
    getMany: (ids) =>
      Effect.flatMap(read("getMany", Schema.Array(GroupMembership.Id), ids), driver.getMany),
    findActive: Effect.fn("GroupMembershipStore.findActive")(function* (groupId, memberId) {
      return yield* driver.findActive(
        yield* read("findActive", GroupId.Id, groupId),
        yield* read("findActive", MemberId.Id, memberId),
      );
    }),
    findActiveMany: Effect.fn("GroupMembershipStore.findActiveMany")(
      function* (groupId, memberIds) {
        return yield* driver.findActiveMany(
          yield* read("findActiveMany", GroupId.Id, groupId),
          yield* read("findActiveMany", Schema.Array(MemberId.Id), memberIds),
        );
      },
    ),
    summarize: Effect.fn("GroupMembershipStore.summarize")(function* (groupIds, memberId) {
      return yield* driver.summarize(
        yield* read("summarize", Schema.Array(GroupId.Id), groupIds),
        yield* read("summarize", MemberId.Id, memberId),
      );
    }),
    listByGroup: (groupId) =>
      Effect.flatMap(read("listByGroup", GroupId.Id, groupId), driver.listByGroup),
    pageActiveByGroup: Effect.fn("GroupMembershipStore.pageActiveByGroup")(
      function* (groupId, options) {
        return yield* driver.pageActiveByGroup(
          yield* read("pageActiveByGroup", GroupId.Id, groupId),
          yield* read("pageActiveByGroup", GroupMembership.ListOptions, options),
        );
      },
    ),
    pageActiveByMember: Effect.fn("GroupMembershipStore.pageActiveByMember")(
      function* (memberId, options) {
        return yield* driver.pageActiveByMember(
          yield* read("pageActiveByMember", MemberId.Id, memberId),
          yield* read("pageActiveByMember", GroupMembership.ByMemberOptions, options),
        );
      },
    ),
    listActiveByMember: (memberId) =>
      Effect.flatMap(read("listActiveByMember", MemberId.Id, memberId), driver.listActiveByMember),
    insert: (record) =>
      write("insert", GroupMembership.GroupMembership, record).pipe(
        Effect.filterOrFail(
          (record) => record.status === "active",
          () =>
            StoreError.rejected("GroupMembershipStore", "insert", "Expected an active admission"),
        ),
        Effect.flatMap(driver.insert),
      ),
    markRemoved: (removal) =>
      Effect.flatMap(write("markRemoved", GroupMembership.Removal, removal), driver.markRemoved),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(GroupMembership.GroupMembership));
const byId = (left: GroupMembership.GroupMembership, right: GroupMembership.GroupMembership) =>
  MemoryDatabase.compareBinary(left.id, right.id);

/**
 * Recorded group admissions; one active admission per group and workspace membership.
 */
const makeMemory = Effect.fn("GroupMembershipStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const all = Effect.flatMap(read, (space) => rows.all(space.records.of("groupMemberships")));
  const driver: GroupMembershipStore["Service"] = {
    get: Effect.fn("GroupMembershipStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("groupMemberships"), id);
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "get")),
    ),
    getMany: Effect.fn("GroupMembershipStore.memory.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("groupMemberships"), ids);
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "getMany")),
    ),
    findActive: Effect.fn("GroupMembershipStore.memory.findActive")(
      function* (groupId, memberId) {
        return Array.findFirst(
          yield* all,
          (record) =>
            record.groupId === groupId &&
            record.memberId === memberId &&
            record.status === "active",
        );
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "findActive")),
    ),
    findActiveMany: Effect.fn("GroupMembershipStore.memory.findActiveMany")(
      function* (groupId, input) {
        const memberIds = new Set(input);
        if (memberIds.size === 0) return [];
        return (yield* all).filter(
          (record) =>
            record.groupId === groupId &&
            record.status === "active" &&
            memberIds.has(record.memberId),
        );
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "findActiveMany")),
    ),
    summarize: Effect.fn("GroupMembershipStore.memory.summarize")(
      function* (groupInput, memberId) {
        const groupIds = new Set(groupInput);
        if (groupIds.size === 0) return [];
        const summaries = new Map<Group.Id, Group.Summary>();
        for (const record of yield* all) {
          if (record.status !== "active" || !groupIds.has(record.groupId)) continue;
          const summary = summaries.get(record.groupId);
          summaries.set(record.groupId, {
            groupId: record.groupId,
            members: (summary?.members ?? 0) + 1,
            joined: (summary?.joined ?? false) || record.memberId === memberId,
          });
        }
        return [...summaries.values()];
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "summarize")),
    ),
    listByGroup: Effect.fn("GroupMembershipStore.memory.listByGroup")(
      function* (groupId) {
        return (yield* all).filter((record) => record.groupId === groupId).toSorted(byId);
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "listByGroup")),
    ),
    pageActiveByGroup: Effect.fn("GroupMembershipStore.memory.pageActiveByGroup")(
      function* (groupId, options) {
        const after = options.after;
        return (yield* all)
          .filter(
            (record) =>
              record.groupId === groupId &&
              record.status === "active" &&
              (after === undefined || MemoryDatabase.compareBinary(record.id, after) > 0),
          )
          .toSorted(byId)
          .slice(0, options.limit);
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "pageActiveByGroup")),
    ),
    pageActiveByMember: Effect.fn("GroupMembershipStore.memory.pageActiveByMember")(
      function* (memberId, options) {
        const after = options.afterGroupId;
        return (yield* all)
          .filter(
            (record) =>
              record.memberId === memberId &&
              record.status === "active" &&
              (after === undefined || MemoryDatabase.compareBinary(record.groupId, after) > 0),
          )
          .toSorted((left, right) => MemoryDatabase.compareBinary(left.groupId, right.groupId))
          .slice(0, options.limit);
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "pageActiveByMember")),
    ),
    listActiveByMember: Effect.fn("GroupMembershipStore.memory.listActiveByMember")(
      function* (memberId) {
        return (yield* all)
          .filter((record) => record.memberId === memberId && record.status === "active")
          .toSorted(byId);
      },
      Effect.mapError(StoreError.failed("GroupMembershipStore", "listActiveByMember")),
    ),
    markRemoved: Effect.fn("GroupMembershipStore.memory.markRemoved")(function* (removal) {
      const space = yield* write.pipe(
        Effect.mapError(StoreError.failed("GroupMembershipStore", "markRemoved")),
      );
      const current = yield* rows
        .get(space.records.of("groupMemberships"), removal.membershipId)
        .pipe(Effect.mapError(StoreError.failed("GroupMembershipStore", "markRemoved")));
      if (
        Option.isNone(current) ||
        current.value.groupId !== removal.groupId ||
        current.value.memberId !== removal.memberId ||
        current.value.status !== "active"
      )
        return yield* StoreError.rejected(
          "GroupMembershipStore",
          "markRemoved",
          "Expected the specified active group admission",
        );
      const row = yield* rows
        .encode({ ...current.value, status: "removed" })
        .pipe(Effect.mapError(StoreError.failed("GroupMembershipStore", "markRemoved")));
      space.records.of("groupMemberships").set(removal.membershipId, row);
    }),
    insert: Effect.fn("GroupMembershipStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(
        Effect.mapError(StoreError.failed("GroupMembershipStore", "insert")),
      );
      const admissions = yield* rows
        .all(space.records.of("groupMemberships"))
        .pipe(Effect.mapError(StoreError.failed("GroupMembershipStore", "insert")));
      if (
        space.records.of("groupMemberships").has(record.id) ||
        admissions.some(
          (admission) =>
            admission.groupId === record.groupId &&
            admission.memberId === record.memberId &&
            admission.status === "active",
        )
      )
        return yield* StoreError.rejected(
          "GroupMembershipStore",
          "insert",
          "Admission ID reused, or the member is already admitted",
        );
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(StoreError.failed("GroupMembershipStore", "insert")));
      space.records.of("groupMemberships").set(record.id, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `GroupMembershipStore` in process memory, over the workspace's `Store.MemoryBinding`:
 * each group admission, active and removed. It keeps what the contract leaves to storage: a reused
 * ID is rejected, and so is a second active admission of one member to one group; removing
 * is rejected unless the admission is stored, active, and of the group and member named. `make`
 * checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(GroupMembershipStore, makeMemory());
