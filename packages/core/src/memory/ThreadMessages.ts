/**
 * The memory implementation of `ThreadMessageStore` from `../thread/ThreadMessageStore.ts`, over
 * the workspace's `Binding`. It keeps what the contract leaves to storage: a reused ID conflicts;
 * an edit conflicts unless the message is stored, still has text, and the edit is its next
 * revision; and deleting conflicts unless the message is stored and still has text. A deleted
 * message keeps its row. `ThreadMessageStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { Thread, ThreadMessage, ThreadMessageStore } from "../thread/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(ThreadMessage.Record));
const hasText = (record: ThreadMessage.Record) =>
  ThreadMessage.Content.isAnyOf(["Text"])(record.content);

/**
 * Messages over the current workspace transaction, which `ThreadMessageProjection` writes.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadMessages.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const driver: ThreadMessageStore.ThreadMessageStore["Service"] = {
    get: Effect.fn("ThreadMessages.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("threadMessages"), id);
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "get")),
    ),
    getMany: Effect.fn("ThreadMessages.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("threadMessages"), ids);
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "getMany")),
    ),
    countByThread: Effect.fn("ThreadMessages.countByThread")(
      function* (ids) {
        const wanted = new Set(ids);
        const counts = new Map<Thread.Id, number>();
        for (const record of yield* rows.all((yield* read).records.of("threadMessages")))
          if (wanted.has(record.threadId) && hasText(record))
            counts.set(record.threadId, (counts.get(record.threadId) ?? 0) + 1);
        return [...counts].map(([threadId, count]) => ({ threadId, count }));
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "countByThread")),
    ),
    insert: Effect.fn("ThreadMessages.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadMessageStore, "insert")));
      if (space.records.of("threadMessages").has(record.id))
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Message ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ThreadMessageStore, "insert")));
      space.records.of("threadMessages").set(record.id, row);
    }),
    edit: Effect.fn("ThreadMessages.edit")(function* (edited) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadMessageStore, "edit")));
      const found = yield* rows
        .get(space.records.of("threadMessages"), edited.messageId)
        .pipe(Effect.mapError(storeFailure(ThreadMessageStore, "edit")));
      if (Option.isNone(found) || !ThreadMessage.Content.isAnyOf(["Text"])(found.value.content))
        return yield* new ThreadMessageStore.Conflict({
          operation: "edit",
          message: "Expected a message with text",
        });
      if (edited.revision !== found.value.content.revision + 1)
        return yield* new ThreadMessageStore.Conflict({
          operation: "edit",
          message: "Expected the message's next revision",
        });
      const content: ThreadMessage.Content = {
        _tag: "Text",
        text: edited.text,
        mentions: edited.mentions,
        revision: edited.revision,
        editedAt: edited.editedAt,
      };
      const row = yield* rows
        .encode(Object.assign({}, found.value, { content }))
        .pipe(Effect.mapError(storeFailure(ThreadMessageStore, "edit")));
      space.records.of("threadMessages").set(edited.messageId, row);
    }),
    delete: Effect.fn("ThreadMessages.delete")(function* (deleted) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadMessageStore, "delete")));
      const found = yield* rows
        .get(space.records.of("threadMessages"), deleted.messageId)
        .pipe(Effect.mapError(storeFailure(ThreadMessageStore, "delete")));
      if (Option.isNone(found) || !hasText(found.value))
        return yield* new ThreadMessageStore.Conflict({
          operation: "delete",
          message: "Expected a message with text",
        });
      const content: ThreadMessage.Content = { _tag: "Deleted", deletedAt: deleted.deletedAt };
      const row = yield* rows
        .encode(Object.assign({}, found.value, { content }))
        .pipe(Effect.mapError(storeFailure(ThreadMessageStore, "delete")));
      space.records.of("threadMessages").set(deleted.messageId, row);
    }),
  };
  return ThreadMessageStore.make(workspaceId, driver);
});
/**
 * Provide message storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadMessageStore.ThreadMessageStore, make());
