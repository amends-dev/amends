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
  readonly findActive: (
    groupId: GroupId.Id,
    memberId: MemberId.Id,
  ) => Effect.Effect<Option.Option<GroupMembership.Record>, Failure>;
  /** Stable ID order, including historical admissions. This is an internal store read. */
  readonly listByGroup: (
    groupId: GroupId.Id,
  ) => Effect.Effect<ReadonlyArray<GroupMembership.Record>, Failure>;
  /**
   * Insert an active admission. Reject malformed/foreign records, missing group or workspace
   * member, reused admission IDs, and duplicate active group/member pairs. Current workspace
   * member status is checked by the application, never during historical projection replay.
   */
  readonly insert: (
    record: GroupMembership.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/membership/store/Service",
) {}

export * as GroupMembershipStore from "./store.ts";
