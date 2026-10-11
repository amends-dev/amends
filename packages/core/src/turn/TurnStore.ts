/**
 * The storage contract for turns, which every storage adapter implements and `TurnProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that. It enforces that an agent
 * has at most one active turn on each thread.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/Store.ts";
import * as ThreadId from "../thread/ThreadId.ts";

import * as MemberId from "../workspace/MemberId.ts";
import * as Turn from "./Turn.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";

/**
 * Storage failed while reading or writing turns.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("TurnStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, a second
 * active turn for the same agent and thread, or a missing turn.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("TurnStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The turn store, bound to one workspace by the host: what a storage adapter implements for
 * turns. Reads honor an existing transaction; writes require one.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class TurnStore extends Context.Service<
  TurnStore,
  {
    /** The turn, if stored. */
    readonly get: (id: Turn.Id) => Effect.Effect<Option.Option<Turn.Turn>, Failure>;
    /** The agent's active turn on the thread: queued, running, or cancelling. */
    readonly findActive: (
      memberId: MemberId.Id,
      threadId: ThreadId.Id,
    ) => Effect.Effect<Option.Option<Turn.Turn>, Failure>;
    /**
     * The agent's most recent turn on the thread, active or finished: by creation, then by how far
     * its accepted input reaches, which a later turn always extends.
     */
    readonly findLatest: (
      memberId: MemberId.Id,
      threadId: ThreadId.Id,
    ) => Effect.Effect<Option.Option<Turn.Turn>, Failure>;
    /** Every active turn in the workspace, oldest first, at most `limit`. */
    readonly listActive: (limit: number) => Effect.Effect<ReadonlyArray<Turn.Turn>, Failure>;
    /** The agent's active turns, one at most per thread, oldest first. */
    readonly listActiveByMember: (
      memberId: MemberId.Id,
    ) => Effect.Effect<ReadonlyArray<Turn.Turn>, Failure>;
    /**
     * Reject reused IDs and a second active turn for the same agent
     * and thread. Never upsert.
     */
    readonly insert: (
      record: Turn.Turn,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** Replace a stored turn; a missing record conflicts. */
    readonly update: (
      record: Turn.Turn,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/turn/store/Service") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: TurnStore["Service"],
): TurnStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Turn.Id, id), driver.get),
    findActive: Effect.fn("TurnStore.findActive")(function* (memberId, threadId) {
      return yield* driver.findActive(
        yield* read("findActive", MemberId.Id, memberId),
        yield* read("findActive", ThreadId.Id, threadId),
      );
    }),
    findLatest: Effect.fn("TurnStore.findLatest")(function* (memberId, threadId) {
      return yield* driver.findLatest(
        yield* read("findLatest", MemberId.Id, memberId),
        yield* read("findLatest", ThreadId.Id, threadId),
      );
    }),
    listActive: (limit) =>
      Effect.flatMap(read("listActive", Schema.Natural, limit), driver.listActive),
    listActiveByMember: (memberId) =>
      Effect.flatMap(read("listActiveByMember", MemberId.Id, memberId), driver.listActiveByMember),
    insert: (record) => Effect.flatMap(write("insert", Turn.Turn, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Turn.Turn, record), driver.update),
  };
};
