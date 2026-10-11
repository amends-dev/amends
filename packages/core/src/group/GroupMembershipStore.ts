/**
 * The storage contract for admissions, which every storage adapter implements and
 * `GroupMembershipProjection` writes. Reads honor the caller's transaction when there is one;
 * writes require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/Store.ts";

import * as MemberId from "../workspace/MemberId.ts";
import type * as Group from "./Group.ts";
import * as GroupId from "./GroupId.ts";
import * as GroupMembership from "./GroupMembership.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";

/**
 * Storage failed while reading or writing admissions.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("GroupMembershipStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, a second
 * active admission of one member to one group, or a missing or ended admission.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("GroupMembershipStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

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
    ) => Effect.Effect<Option.Option<GroupMembership.Record>, Failure>;
    /**
     * Find several admissions, active or ended, in one read. Absent IDs are omitted and each found
     * record appears once; order is unspecified, so callers index results by ID. An empty request
     * reads nothing.
     */
    readonly getMany: (
      ids: ReadonlyArray<GroupMembership.Id>,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.Record>, Failure>;
    /** The member's active admission to the group, if any: at most one is active at a time. */
    readonly findActive: (
      groupId: GroupId.Id,
      memberId: MemberId.Id,
    ) => Effect.Effect<Option.Option<GroupMembership.Record>, Failure>;
    /**
     * The group's active admissions of these members, in one read. Each found record appears once;
     * order is unspecified, so callers index results by member. An empty request reads nothing.
     */
    readonly findActiveMany: (
      groupId: GroupId.Id,
      memberIds: ReadonlyArray<MemberId.Id>,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.Record>, Failure>;
    /**
     * How many active admissions each of several groups has, and whether this member holds one, in
     * one read. Groups without any are omitted; order is unspecified. An empty request reads
     * nothing.
     */
    readonly summarize: (
      groupIds: ReadonlyArray<GroupId.Id>,
      memberId: MemberId.Id,
    ) => Effect.Effect<ReadonlyArray<Group.Summary>, Failure>;
    /**
     * Every admission of a group, active or ended, in stable ID order. A history read for
     * inspection; operations use the bounded reads.
     */
    readonly listByGroup: (
      groupId: GroupId.Id,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.Record>, Failure>;
    /** A page of a group's active admissions in binary admission-ID order, after the cursor. */
    readonly pageActiveByGroup: (
      groupId: GroupId.Id,
      options: GroupMembership.ListOptions,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.Record>, Failure>;
    /** A page of a member's active admissions in binary group-ID order, after the group cursor. */
    readonly pageActiveByMember: (
      memberId: MemberId.Id,
      options: GroupMembership.ByMemberOptions,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.Record>, Failure>;
    /**
     * A member's active admissions, in stable admission-ID order, which `MemberService.remove`
     * ends when the member is removed from the workspace. Internal only.
     */
    readonly listActiveByMember: (
      memberId: MemberId.Id,
    ) => Effect.Effect<ReadonlyArray<GroupMembership.Record>, Failure>;
    /**
     * Insert an active admission. Reject reused admission IDs and duplicate active group/member
     * pairs. The group and member are recorded as given: the
     * application checks that they exist and the member is current.
     */
    readonly insert: (
      record: GroupMembership.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * End the specified active admission, preserving its other fields. Reject missing or ended
     * admissions and mismatched group/member references.
     * Reason and attribution remain in the journal; replay never checks current authority.
     */
    readonly markRemoved: (
      removal: GroupMembership.Removal,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/group/membership/store/Service") {}

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
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
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
      write("insert", GroupMembership.Record, record).pipe(
        Effect.filterOrFail(
          (record) => record.status === "active",
          () => new Conflict({ operation: "insert", message: "Expected an active admission" }),
        ),
        Effect.flatMap(driver.insert),
      ),
    markRemoved: (removal) =>
      Effect.flatMap(write("markRemoved", GroupMembership.Removal, removal), driver.markRemoved),
  };
};
