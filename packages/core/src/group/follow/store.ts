import { Context, Schema } from "effect";
import type { DateTime, Effect, Option } from "effect";
import type { Store } from "../../journal/store.ts";

import type { GroupId } from "../id.ts";
import type { GroupMembership } from "../membership/membership.ts";
import type { GroupFollow } from "./follow.ts";

export class Failure extends Schema.TaggedError<Failure>()("GroupFollowStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("GroupFollowStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Projection storage for group follows. Reads honor the caller transaction; writes require it. */
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
   * Insert an active follow. Reject malformed or foreign records, reused IDs, and a second active
   * follow for one admission. The admission is recorded as given: the application checks that it
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
  "@amends/core/group/follow/store/Service",
) {}

export * as GroupFollowStore from "./store.ts";
