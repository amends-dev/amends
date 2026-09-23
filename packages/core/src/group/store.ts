import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import type { MemberId } from "../workspace/member/id.ts";
import type { Group } from "./group.ts";

export class Failure extends Schema.TaggedError<Failure>()("GroupStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("GroupStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Internal projection storage. Reads honor an existing transaction; writes require one. */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  readonly get: (id: Group.Id) => Effect.Effect<Option.Option<Group.Record>, Failure>;
  /** The direct group with exactly these members, in any order. */
  readonly findDirect: (
    memberIds: ReadonlyArray<MemberId.Id>,
  ) => Effect.Effect<Option.Option<Group.DirectRecord>, Failure>;
  /**
   * Reject invalid/foreign records, missing creator membership, reused IDs, and a second direct
   * group for the same member set. Never upsert.
   */
  readonly insert: (
    record: Group.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/store/Service",
) {}

export * as GroupStore from "./store.ts";
