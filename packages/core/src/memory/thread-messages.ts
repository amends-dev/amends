import { Thread, ThreadMessage, ThreadMessageStore } from "../thread/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const rows = Rows.make(Schema.fromJsonString(ThreadMessage.Record));
const hasText = (record: ThreadMessage.Record) =>
  ThreadMessage.Content.isAnyOf(["Text"])(record.content);

/** Workspace-bound thread-messages projection storage. @category constructors */
export const make = Effect.fn("ThreadMessages.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const driver: ThreadMessageStore.Interface = {
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
/** @category layers */
export const layer = Layer.effect(ThreadMessageStore.Service, make());
export * as ThreadMessages from "./thread-messages.ts";
