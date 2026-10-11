/**
 * The memory implementation of `ChannelBindingStore` from `../channel/ChannelBindingStore.ts`, over
 * the workspace's `Binding`. Bindings are keyed by thread. It keeps what the contract leaves to
 * storage: a thread binds to one conversation and a channel's conversation to one thread, so a
 * second binding of either conflicts. `ChannelBindingStore.make` checks every input before this
 * driver sees it.
 *
 * @since 0.1.0
 */
import { ChannelBinding, ChannelBindingStore } from "../channel/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(ChannelBinding.ChannelBinding));

/**
 * Channel bindings over the current workspace transaction, keyed by thread.
 *
 * @category constructors
 * @since 0.1.0
 */
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

/**
 * Provide channel binding storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ChannelBindingStore.ChannelBindingStore, make());
