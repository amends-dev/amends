import { Store } from "@amends/core/journal";
import { ThreadMessage, ThreadMessageStore } from "@amends/core/thread";
import { Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validate = Schema.decodeEffect(Schema.toType(ThreadMessage.Record));
const rows = Rows.make(Schema.fromJsonString(ThreadMessage.Record));

/** Workspace-bound thread-messages projection storage. @category constructors */
export const make = Effect.fn("ThreadMessages.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  return ThreadMessageStore.Service.of({
    workspaceId,
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
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadMessageStore.Service, make());
export * as ThreadMessages from "./thread-messages.ts";
