import { Context, Effect, Schema } from "effect";
import type { DateTime, Option } from "effect";
import type { Store } from "../../journal/store.ts";

import { GroupId } from "../id.ts";
import { GroupMembership } from "../membership/membership.ts";
import { GroupFollow } from "./follow.ts";
import { StoreInput } from "../../journal/StoreInput.ts";
import type { WorkspaceId } from "../../workspace/id.ts";

export class Failure extends Schema.TaggedError<Failure>()("GroupFollowStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("GroupFollowStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Projection storage for group follows. Reads honor the caller transaction; writes require it.
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export interface Interface {
  readonly get: (id: GroupFollow.Id) => Effect.Effect<Option.Option<GroupFollow.Record>, Failure>;
  /** The active follow of one group admission; None when that admission follows nothing. */
  readonly findActive: (
    groupMembershipId: GroupMembership.Id,
  ) => Effect.Effect<Option.Option<GroupFollow.Record>, Failure>;
  /** The active follows of several admissions in one read; admissions without one are omitted. */
  readonly findActiveMany: (
    groupMembershipIds: ReadonlyArray<GroupMembership.Id>,
  ) => Effect.Effect<ReadonlyArray<GroupFollow.Record>, Failure>;
  /** Active follows of a group, in stable ID order. */
  readonly listActiveByGroup: (
    groupId: GroupId.Id,
  ) => Effect.Effect<ReadonlyArray<GroupFollow.Record>, Failure>;
  /**
   * Insert an active follow. Reject reused IDs and a second active follow for one admission. The admission is recorded as given: the application checks that it
   * is current and belongs to the group and member.
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

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/group/follow/store/Service",
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

export * as GroupFollowStore from "./store.ts";
