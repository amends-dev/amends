import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../../journal/store.ts";
import type { WorkspaceId } from "../../workspace/id.ts";
import type { MemberId } from "../../workspace/member/id.ts";
import type { GroupId } from "../id.ts";
import type { GroupMembership } from "./membership.ts";

export class Failure extends Schema.TaggedError<Failure>()("GroupMembershipStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("GroupMembershipStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Projection storage for admissions, retaining their workspace-membership references. */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
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
   * Insert an active admission. Reject malformed/foreign records, missing group or workspace
   * member, reused admission IDs, and duplicate active group/member pairs. Current workspace
   * member status is checked by the application, never during historical projection replay.
   */
  readonly insert: (
    record: GroupMembership.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * End the specified active admission, preserving its other fields. Reject malformed or
   * foreign input, missing/ended admissions, and mismatched group/member references.
   * Reason and attribution remain in the journal; replay never checks current authority.
   */
  readonly markRemoved: (
    removal: GroupMembership.Removal,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/membership/store/Service",
) {}

export * as GroupMembershipStore from "./store.ts";
