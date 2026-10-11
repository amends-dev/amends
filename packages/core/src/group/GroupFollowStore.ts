/**
 * The storage contract for follows, which every storage adapter implements and
 * `GroupFollowProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { DateTime, Option } from "effect";
import type * as Store from "../journal/Store.ts";

import * as GroupId from "./GroupId.ts";
import * as GroupMembership from "./GroupMembership.ts";
import * as GroupFollow from "./GroupFollow.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";

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
    readonly get: (id: GroupFollow.Id) => Effect.Effect<Option.Option<GroupFollow.Record>, Failure>;
    /** The active follow of one group admission; None when that admission follows nothing. */
    readonly findActive: (
      groupMembershipId: GroupMembership.Id,
    ) => Effect.Effect<Option.Option<GroupFollow.Record>, Failure>;
    /** The active follows of several admissions in one read; admissions without one are omitted. */
    readonly findActiveMany: (
      groupMembershipIds: ReadonlyArray<GroupMembership.Id>,
    ) => Effect.Effect<ReadonlyArray<GroupFollow.Record>, Failure>;
    /** Active follows of a group, in stable ID order, which `ThreadQuery.followers` reads. */
    readonly listActiveByGroup: (
      groupId: GroupId.Id,
    ) => Effect.Effect<ReadonlyArray<GroupFollow.Record>, Failure>;
    /**
     * Insert an active follow. Reject reused IDs and a second active follow for one admission. The
     * admission is recorded as given: the application checks that it is current and belongs to the
     * group and member.
     */
    readonly insert: (
      record: GroupFollow.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** End exactly the addressed active follow; mismatched or ended follows conflict. */
    readonly end: (
      ending: GroupFollow.Ending,
      endedAt: DateTime.Utc,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/group/follow/store/Service") {}

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
      write("insert", GroupFollow.Record, record).pipe(
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
