/**
 * The storage contract for messages, which every storage adapter implements and
 * `ThreadMessageProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/Store.ts";

import * as ThreadMessage from "./ThreadMessage.ts";
import * as ThreadId from "./ThreadId.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";

/**
 * How many messages a thread holds whose content remains.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Count = Schema.Struct({
  threadId: ThreadId.Id,
  count: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Count extends Schema.Schema.Type<typeof Count> {}

/**
 * Storage failed while reading or writing messages.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ThreadMessageStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, an edit at a
 * revision other than the next, or an edit or deletion of a missing or deleted message.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("ThreadMessageStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The message store, bound to one workspace by the host.
 *
 * What a storage adapter implements for messages.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadMessageStore extends Context.Service<
  ThreadMessageStore,
  {
    readonly get: (
      id: ThreadMessage.Id,
    ) => Effect.Effect<Option.Option<ThreadMessage.Record>, Failure>;
    /**
     * Find several messages in one read. Absent IDs are omitted and each found record appears once;
     * order is unspecified, so callers index results by ID. An empty request reads nothing.
     */
    readonly getMany: (
      ids: ReadonlyArray<ThreadMessage.Id>,
    ) => Effect.Effect<ReadonlyArray<ThreadMessage.Record>, Failure>;
    /**
     * How many messages whose content remains each of several threads holds, in one read. Threads
     * with none, and absent IDs, are omitted; order is unspecified.
     */
    readonly countByThread: (
      ids: ReadonlyArray<ThreadId.Id>,
    ) => Effect.Effect<ReadonlyArray<Count>, Failure>;
    /**
     * Reject reused IDs. The author and mentions are recorded as
     * given: publication checks that they take part. Preserve historical values on replay.
     */
    readonly insert: (
      record: ThreadMessage.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * Projection write that replaces a message's text and mentions at the edit's revision, the
     * next after the current one. A missing or deleted message, or another revision,
     * conflicts.
     */
    readonly edit: (
      edited: ThreadMessage.Edited,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * Projection write that replaces a message's content with its deletion. A missing or already deleted
     * message conflicts.
     */
    readonly delete: (
      deleted: ThreadMessage.Deleted,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/thread/ThreadMessageStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: ThreadMessageStore["Service"],
): ThreadMessageStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", ThreadMessage.Id, id), driver.get),
    getMany: (ids) =>
      Effect.flatMap(read("getMany", Schema.Array(ThreadMessage.Id), ids), driver.getMany),
    countByThread: (ids) =>
      Effect.flatMap(read("countByThread", Schema.Array(ThreadId.Id), ids), driver.countByThread),
    insert: (record) =>
      Effect.flatMap(write("insert", ThreadMessage.Record, record), driver.insert),
    edit: (edited) => Effect.flatMap(write("edit", ThreadMessage.Edited, edited), driver.edit),
    delete: (deleted) =>
      Effect.flatMap(write("delete", ThreadMessage.Deleted, deleted), driver.delete),
  };
};
