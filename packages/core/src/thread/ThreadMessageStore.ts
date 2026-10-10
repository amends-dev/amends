/**
 * The storage contract for messages, which every storage adapter implements and
 * `ThreadMessageProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";

import type { ThreadMessage } from "./ThreadMessage.ts";
import { ThreadId } from "./ThreadId.ts";

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
 * What a storage adapter implements for messages.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
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
   * Reject malformed or foreign records and reused IDs. The author and mentions are recorded as
   * given: publication checks that they take part. Preserve historical values on replay.
   */
  readonly insert: (
    record: ThreadMessage.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Projection write that replaces a message's text and mentions at the edit's revision, the
   * next after the current one. A missing, foreign, or deleted message, or another revision,
   * conflicts.
   */
  readonly edit: (
    edited: ThreadMessage.Edited,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Projection write that replaces a message's content with its deletion. A missing, foreign, or
   * already deleted message conflicts.
   */
  readonly delete: (
    deleted: ThreadMessage.Deleted,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

/**
 * The message store, bound to one workspace by the host.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/thread/ThreadMessageStore",
) {}

export * as ThreadMessageStore from "./ThreadMessageStore.ts";
