import { Context, Effect, Schema } from "effect";

import * as GroupId from "../group/id.ts";
import * as ThreadId from "../thread/ThreadId.ts";

import * as MemberId from "../workspace/member/id.ts";
import * as ReadState from "./read-state.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/id.ts";

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
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export class ReadStateStore extends Context.Service<
  ReadStateStore,
  {
    /** One member's read positions for several threads; unread threads are omitted. */
    readonly getThreadPositions: (
      memberId: MemberId.Id,
      threadIds: ReadonlyArray<ThreadId.Id>,
    ) => Effect.Effect<ReadonlyArray<ReadState.ThreadPosition>, Failure>;
    readonly advanceThread: (
      position: ReadState.ThreadPosition,
    ) => Effect.Effect<void, Failure | Conflict>;
    /** One member's read times for several groups; groups never read are omitted. */
    readonly getGroupReads: (
      memberId: MemberId.Id,
      groupIds: ReadonlyArray<GroupId.Id>,
    ) => Effect.Effect<ReadonlyArray<ReadState.GroupRead>, Failure>;
    readonly advanceGroup: (read: ReadState.GroupRead) => Effect.Effect<void, Failure | Conflict>;
  }
>()("@amends-dev/core/read-state/store/Service") {}
/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: ReadStateStore["Service"],
): ReadStateStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    getThreadPositions: Effect.fn("ReadStateStore.getThreadPositions")(
      function* (memberId, threadIds) {
        return yield* driver.getThreadPositions(
          yield* read("getThreadPositions", MemberId.Id, memberId),
          yield* read("getThreadPositions", Schema.Array(ThreadId.Id), threadIds),
        );
      },
    ),
    advanceThread: (position) =>
      Effect.flatMap(
        write("advanceThread", ReadState.ThreadPosition, position),
        driver.advanceThread,
      ),
    getGroupReads: Effect.fn("ReadStateStore.getGroupReads")(function* (memberId, groupIds) {
      return yield* driver.getGroupReads(
        yield* read("getGroupReads", MemberId.Id, memberId),
        yield* read("getGroupReads", Schema.Array(GroupId.Id), groupIds),
      );
    }),
    advanceGroup: (groupRead) =>
      Effect.flatMap(write("advanceGroup", ReadState.GroupRead, groupRead), driver.advanceGroup),
  };
};
