import { Context, Schema } from "effect";
import type { Effect } from "effect";
import type { GroupId } from "../group/id.ts";
import type { ThreadId } from "../thread/id.ts";

import type { MemberId } from "../workspace/member/id.ts";
import type { ReadState } from "./read-state.ts";

export class Failure extends Schema.TaggedError<Failure>()("ReadStateStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("ReadStateStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Private per-member read state, kept outside the journal: rebuilding projections neither restores
 * nor removes it, so it holds no references a rebuild could break. Reads honor the caller's
 * transaction. Writes join the caller's transaction when there is one and otherwise run on their
 * own, without the workspace's write order; each is atomic. Advancing keeps the later of the stored
 * and requested value. A record for another workspace conflicts; callers write only for members,
 * threads, and groups they have checked.
 */
export interface Interface {
  /** One member's read positions for several threads; unread threads are omitted. */
  readonly getThreadPositions: (
    memberId: MemberId.Id,
    threadIds: ReadonlyArray<ThreadId.Id>,
  ) => Effect.Effect<ReadonlyArray<ReadState.ThreadPosition>, Failure>;
  readonly advanceThread: (
    position: ReadState.ThreadPosition,
  ) => Effect.Effect<void, Failure | Conflict>;
  /** One member's caught-up times for several groups; groups never caught up are omitted. */
  readonly getGroupsCaughtUp: (
    memberId: MemberId.Id,
    groupIds: ReadonlyArray<GroupId.Id>,
  ) => Effect.Effect<ReadonlyArray<ReadState.GroupCaughtUp>, Failure>;
  readonly advanceGroup: (
    caughtUp: ReadState.GroupCaughtUp,
  ) => Effect.Effect<void, Failure | Conflict>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/read-state/store/Service",
) {}
export * as ReadStateStore from "./store.ts";
