import { ChannelBinding, ChannelBindingStore } from "../channel/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./binding.ts";
import { storeFailure } from "./errors.ts";
import * as Rows from "./rows.ts";

const rows = Rows.make(Schema.fromJsonString(ChannelBinding.Record));

/** Channel bindings over the current workspace transaction, keyed by thread. @category constructors */
export const make = Effect.fn("ChannelBindings.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const driver: ChannelBindingStore.ChannelBindingStore["Service"] = {
    get: Effect.fn("ChannelBindings.get")(
      function* (threadId) {
        return yield* rows.get((yield* read).records.of("channelBindings"), threadId);
      },
      Effect.mapError(storeFailure(ChannelBindingStore, "get")),
    ),
    findByConversation: Effect.fn("ChannelBindings.findByConversation")(
      function* (channelId, conversationId) {
        const records = yield* rows.all((yield* read).records.of("channelBindings"));
        return Option.fromUndefinedOr(
          records.find(
            (record) => record.channelId === channelId && record.conversation.id === conversationId,
          ),
        );
      },
      Effect.mapError(storeFailure(ChannelBindingStore, "findByConversation")),
    ),
    insert: Effect.fn("ChannelBindings.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ChannelBindingStore, "insert")));
      const stored = yield* rows
        .all(space.records.of("channelBindings"))
        .pipe(Effect.mapError(storeFailure(ChannelBindingStore, "insert")));
      if (
        space.records.of("channelBindings").has(record.threadId) ||
        stored.some(
          (other) =>
            other.channelId === record.channelId &&
            other.conversation.id === record.conversation.id,
        )
      )
        return yield* new ChannelBindingStore.Conflict({
          operation: "insert",
          message: "Thread or conversation already bound",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ChannelBindingStore, "insert")));
      space.records.of("channelBindings").set(record.threadId, row);
    }),
  };
  return ChannelBindingStore.make(workspaceId, driver);
});

/** Provide channel binding storage over the caller's binding. @category layers */
export const layer = Layer.effect(ChannelBindingStore.ChannelBindingStore, make());
