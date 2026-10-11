import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type { Store } from "../../journal/store.ts";

import { MemberId } from "../../workspace/member/id.ts";
import type { Group } from "../group.ts";
import { GroupId } from "../id.ts";
import { GroupMembership } from "./membership.ts";
import { StoreInput } from "../../journal/StoreInput.ts";
import type { WorkspaceId } from "../../workspace/id.ts";

export class Failure extends Schema.TaggedError<Failure>()("GroupMembershipStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("GroupMembershipStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Projection storage for admissions, retaining their workspace-membership references.
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export interface Interface {
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
   * one read. Groups without any are omitted; order is unspecified. An empty request reads nothing.
   */
  readonly summarize: (
    groupIds: ReadonlyArray<GroupId.Id>,
    memberId: MemberId.Id,
  ) => Effect.Effect<ReadonlyArray<Group.Summary>, Failure>;
  /**
   * Stable ID order, including historical admissions. A history read for inspection; operations
   * use the bounded reads.
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
  /** Active admissions for workspace departure, in stable admission-ID order. Internal only. */
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

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/group/membership/store/Service",
) {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.Id, driver: Interface): Interface => {
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

export * as GroupMembershipStore from "./store.ts";
