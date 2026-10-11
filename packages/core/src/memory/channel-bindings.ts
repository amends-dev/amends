import { ChannelBinding, ChannelBindingStore, ChannelId } from "../channel/index.ts";
import { Store } from "../journal/index.ts";
import { Thread } from "../thread/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(ChannelBinding.Record));
const rows = Rows.make(Schema.fromJsonString(ChannelBinding.Record));

/** Channel bindings over the current workspace transaction, keyed by thread. @category constructors */
export const make = Effect.fn("ChannelBindings.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  return ChannelBindingStore.Service.of({
    get: Effect.fn("ChannelBindings.get")(
      function* (input) {
        const threadId = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* rows.get((yield* read).records.of("channelBindings"), threadId);
      },
      Effect.mapError(storeFailure(ChannelBindingStore, "get")),
    ),
    findByConversation: Effect.fn("ChannelBindings.findByConversation")(
      function* (channelInput, conversationInput) {
        const channelId = yield* Schema.decodeEffect(ChannelId.Id)(channelInput);
        const conversationId = yield* Schema.decodeEffect(Schema.NonEmptyString)(conversationInput);
        const records = yield* rows.all((yield* read).records.of("channelBindings"));
        return Option.fromUndefinedOr(
          records.find(
            (record) => record.channelId === channelId && record.conversation.id === conversationId,
          ),
        );
      },
      Effect.mapError(storeFailure(ChannelBindingStore, "findByConversation")),
    ),
    insert: Effect.fn("ChannelBindings.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(ChannelBindingStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ChannelBindingStore.Conflict({
          operation: "insert",
          message: "Expected a binding in this workspace",
        });
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
  });
});

/** Provide channel binding storage over the caller's binding. @category layers */
export const layer = Layer.effect(ChannelBindingStore.Service, make());

export * as ChannelBindings from "./channel-bindings.ts";
