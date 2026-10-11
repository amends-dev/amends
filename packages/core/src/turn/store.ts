import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/store.ts";
import * as ThreadId from "../thread/ThreadId.ts";

import * as MemberId from "../workspace/member/id.ts";
import * as Turn from "./turn.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/id.ts";

export class Failure extends Schema.TaggedError<Failure>()("TurnStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("TurnStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Internal projection storage. Reads honor an existing transaction; writes require one.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export class TurnStore extends Context.Service<
  TurnStore,
  {
    readonly get: (id: Turn.Id) => Effect.Effect<Option.Option<Turn.Record>, Failure>;
    /** The agent's active turn on the thread: queued, running, or cancelling. */
    readonly findActive: (
      memberId: MemberId.Id,
      threadId: ThreadId.Id,
    ) => Effect.Effect<Option.Option<Turn.Record>, Failure>;
    /**
     * The agent's most recent turn on the thread, active or finished: by creation, then by how far
     * its accepted input reaches, which a later turn always extends.
     */
    readonly findLatest: (
      memberId: MemberId.Id,
      threadId: ThreadId.Id,
    ) => Effect.Effect<Option.Option<Turn.Record>, Failure>;
    /** Every active turn in the workspace, oldest first, at most `limit`. */
    readonly listActive: (limit: number) => Effect.Effect<ReadonlyArray<Turn.Record>, Failure>;
    /** The agent's active turns, one at most per thread, oldest first. */
    readonly listActiveByMember: (
      memberId: MemberId.Id,
    ) => Effect.Effect<ReadonlyArray<Turn.Record>, Failure>;
    /**
     * Reject reused IDs and a second active turn for the same agent
     * and thread. Never upsert.
     */
    readonly insert: (
      record: Turn.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** Replace a stored turn; a missing record conflicts. */
    readonly update: (
      record: Turn.Record,
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
    insert: (record) => Effect.flatMap(write("insert", Turn.Record, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Turn.Record, record), driver.update),
  };
};
