import { Store } from "@amends-dev/core/journal";
import { Thread, ThreadMessage, ThreadMessageStore } from "@amends-dev/core/thread";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validate = Schema.decodeEffect(Schema.toType(ThreadMessage.Record));
const rows = Rows.make(Schema.fromJsonString(ThreadMessage.Record));
const hasText = (record: ThreadMessage.Record) =>
  ThreadMessage.Content.isAnyOf(["Text"])(record.content);

/** Workspace-bound thread-messages projection storage. @category constructors */
export const make = Effect.fn("ThreadMessages.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  return ThreadMessageStore.Service.of({
    get: Effect.fn("ThreadMessages.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ThreadMessage.Id)(input);
        return yield* rows.get((yield* read).records.threadMessages, id);
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "get")),
    ),
    getMany: Effect.fn("ThreadMessages.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(ThreadMessage.Id))(input);
        return yield* rows.getMany((yield* read).records.threadMessages, ids);
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "getMany")),
    ),
    countByThread: Effect.fn("ThreadMessages.countByThread")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Thread.Id))(input);
        const wanted = new Set(ids);
        const counts = new Map<Thread.Id, number>();
        for (const record of yield* rows.all((yield* read).records.threadMessages))
          if (wanted.has(record.threadId) && hasText(record))
            counts.set(record.threadId, (counts.get(record.threadId) ?? 0) + 1);
        return [...counts].map(([threadId, count]) => ({ threadId, count }));
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "countByThread")),
    ),
    insert: Effect.fn("ThreadMessages.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(ThreadMessageStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadMessageStore, "insert")));
      if (space.records.threadMessages.has(record.id))
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Message ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ThreadMessageStore, "insert")));
      space.records.threadMessages.set(record.id, row);
    }),
    edit: Effect.fn("ThreadMessages.edit")(function* (input) {
      yield* Store.Transaction;
      const edited = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.Edited))(input).pipe(
        Effect.mapError(storeConflict(ThreadMessageStore, "edit")),
      );
      if (edited.workspaceId !== workspaceId)
        return yield* new ThreadMessageStore.Conflict({
          operation: "edit",
          message: "Expected a message in this workspace",
        });
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadMessageStore, "edit")));
      const found = yield* rows
        .get(space.records.threadMessages, edited.messageId)
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
      space.records.threadMessages.set(edited.messageId, row);
    }),
    delete: Effect.fn("ThreadMessages.delete")(function* (input) {
      yield* Store.Transaction;
      const deleted = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.Deleted))(input).pipe(
        Effect.mapError(storeConflict(ThreadMessageStore, "delete")),
      );
      if (deleted.workspaceId !== workspaceId)
        return yield* new ThreadMessageStore.Conflict({
          operation: "delete",
          message: "Expected a message in this workspace",
        });
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadMessageStore, "delete")));
      const found = yield* rows
        .get(space.records.threadMessages, deleted.messageId)
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
      space.records.threadMessages.set(deleted.messageId, row);
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadMessageStore.Service, make());
export * as ThreadMessages from "./thread-messages.ts";
