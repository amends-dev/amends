/**
 * The storage contract for messages, which every storage adapter implements and
 * `ThreadMessageProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as Store from "../journal/Store.ts"
import * as StoreError from "../journal/StoreError.ts"
import * as StoreInput from "../journal/StoreInput.ts"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import type * as Thread from "./Thread.ts"
import * as ThreadId from "./ThreadId.ts"
import * as ThreadMessage from "./ThreadMessage.ts"

/**
 * How many messages a thread holds whose content remains.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Count = Schema.Struct({
  threadId: ThreadId.Id,
  count: Schema.Int.check(Schema.isGreaterThan(0))
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Count extends Schema.Schema.Type<typeof Count> {}

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
      id: ThreadMessage.Id
    ) => Effect.Effect<Option.Option<ThreadMessage.ThreadMessage>, StoreError.StoreError>
    /**
     * Find several messages in one read. Absent IDs are omitted and each found record appears once;
     * order is unspecified, so callers index results by ID. An empty request reads nothing.
     */
    readonly getMany: (
      ids: ReadonlyArray<ThreadMessage.Id>
    ) => Effect.Effect<ReadonlyArray<ThreadMessage.ThreadMessage>, StoreError.StoreError>
    /**
     * How many messages whose content remains each of several threads holds, in one read. Threads
     * with none, and absent IDs, are omitted; order is unspecified.
     */
    readonly countByThread: (
      ids: ReadonlyArray<ThreadId.Id>
    ) => Effect.Effect<ReadonlyArray<Count>, StoreError.StoreError>
    /**
     * Reject reused IDs. The author and mentions are recorded as
     * given: publication checks that they take part. Preserve historical values on replay.
     */
    readonly insert: (
      record: ThreadMessage.ThreadMessage
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Projection write that replaces a message's text and mentions at the edit's revision, the
     * next after the current one. A missing or deleted message, or another revision,
     * is rejected.
     */
    readonly edit: (edited: ThreadMessage.Edited) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Projection write that replaces a message's content with its deletion. A missing or already
     * deleted message is rejected.
     */
    readonly delete: (deleted: ThreadMessage.Deleted) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
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
  driver: ThreadMessageStore["Service"]
): ThreadMessageStore["Service"] => {
  const read = StoreInput.read("ThreadMessageStore")
  const write = StoreInput.write("ThreadMessageStore", workspaceId)
  return {
    get: (id) => Effect.flatMap(read("get", ThreadMessage.Id, id), driver.get),
    getMany: (ids) => Effect.flatMap(read("getMany", Schema.Array(ThreadMessage.Id), ids), driver.getMany),
    countByThread: (ids) => Effect.flatMap(read("countByThread", Schema.Array(ThreadId.Id), ids), driver.countByThread),
    insert: (record) => Effect.flatMap(write("insert", ThreadMessage.ThreadMessage, record), driver.insert),
    edit: (edited) => Effect.flatMap(write("edit", ThreadMessage.Edited, edited), driver.edit),
    delete: (deleted) => Effect.flatMap(write("delete", ThreadMessage.Deleted, deleted), driver.delete)
  }
}

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(ThreadMessage.ThreadMessage))
const hasText = (record: ThreadMessage.ThreadMessage) => ThreadMessage.Content.isAnyOf(["Text"])(record.content)

/**
 * Messages over the current workspace transaction, which `ThreadMessageProjection` writes.
 */
const makeMemory = Effect.fn("ThreadMessageStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding
  const driver: ThreadMessageStore["Service"] = {
    get: Effect.fn("ThreadMessageStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("threadMessages"), id)
      },
      Effect.mapError(StoreError.failed("ThreadMessageStore", "get"))
    ),
    getMany: Effect.fn("ThreadMessageStore.memory.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("threadMessages"), ids)
      },
      Effect.mapError(StoreError.failed("ThreadMessageStore", "getMany"))
    ),
    countByThread: Effect.fn("ThreadMessageStore.memory.countByThread")(
      function* (ids) {
        const wanted = new Set(ids)
        const counts = new Map<Thread.Id, number>()
        for (const record of yield* rows.all((yield* read).records.of("threadMessages")))
          if (wanted.has(record.threadId) && hasText(record))
            counts.set(record.threadId, (counts.get(record.threadId) ?? 0) + 1)
        return [...counts].map(([threadId, count]) => ({ threadId, count }))
      },
      Effect.mapError(StoreError.failed("ThreadMessageStore", "countByThread"))
    ),
    insert: Effect.fn("ThreadMessageStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(StoreError.failed("ThreadMessageStore", "insert")))
      if (space.records.of("threadMessages").has(record.id))
        return yield* StoreError.rejected("ThreadMessageStore", "insert", "Message ID already exists")
      const row = yield* rows.encode(record).pipe(Effect.mapError(StoreError.failed("ThreadMessageStore", "insert")))
      space.records.of("threadMessages").set(record.id, row)
    }),
    edit: Effect.fn("ThreadMessageStore.memory.edit")(function* (edited) {
      const space = yield* write.pipe(Effect.mapError(StoreError.failed("ThreadMessageStore", "edit")))
      const found = yield* rows
        .get(space.records.of("threadMessages"), edited.messageId)
        .pipe(Effect.mapError(StoreError.failed("ThreadMessageStore", "edit")))
      if (Option.isNone(found) || !ThreadMessage.Content.isAnyOf(["Text"])(found.value.content))
        return yield* StoreError.rejected("ThreadMessageStore", "edit", "Expected a message with text")
      if (edited.revision !== found.value.content.revision + 1)
        return yield* StoreError.rejected("ThreadMessageStore", "edit", "Expected the message's next revision")
      const content: ThreadMessage.Content = {
        _tag: "Text",
        text: edited.text,
        mentions: edited.mentions,
        revision: edited.revision,
        editedAt: edited.editedAt
      }
      const row = yield* rows
        .encode(Object.assign({}, found.value, { content }))
        .pipe(Effect.mapError(StoreError.failed("ThreadMessageStore", "edit")))
      space.records.of("threadMessages").set(edited.messageId, row)
    }),
    delete: Effect.fn("ThreadMessageStore.memory.delete")(function* (deleted) {
      const space = yield* write.pipe(Effect.mapError(StoreError.failed("ThreadMessageStore", "delete")))
      const found = yield* rows
        .get(space.records.of("threadMessages"), deleted.messageId)
        .pipe(Effect.mapError(StoreError.failed("ThreadMessageStore", "delete")))
      if (Option.isNone(found) || !hasText(found.value))
        return yield* StoreError.rejected("ThreadMessageStore", "delete", "Expected a message with text")
      const content: ThreadMessage.Content = { _tag: "Deleted", deletedAt: deleted.deletedAt }
      const row = yield* rows
        .encode(Object.assign({}, found.value, { content }))
        .pipe(Effect.mapError(StoreError.failed("ThreadMessageStore", "delete")))
      space.records.of("threadMessages").set(deleted.messageId, row)
    })
  }
  return make(workspaceId, driver)
})

/**
 * Provide `ThreadMessageStore` in process memory, over the workspace's `Store.MemoryBinding`. It
 * keeps what the contract leaves to storage: a reused ID is rejected; an edit is rejected unless
 * the message is stored, still has text, and the edit is its next revision; and deleting is
 * rejected unless the message is stored and still has text. A deleted message keeps its row. `make`
 * checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ThreadMessageStore, makeMemory())
