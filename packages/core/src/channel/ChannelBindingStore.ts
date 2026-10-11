/**
 * The storage contract for channel bindings, which every storage adapter implements and
 * `ChannelProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { ChannelTransport } from "@amends-dev/channel";
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Store from "../journal/Store.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as ChannelBinding from "./ChannelBinding.ts";
import * as ChannelId from "./ChannelId.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import { storeFailure } from "../journal/internal/store-failure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing bindings.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ChannelBindingStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a thread bound already,
 * or a conversation bound to another thread of the same channel.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("ChannelBindingStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The binding store, bound to one workspace by the host.
 *
 * What a storage adapter implements for bindings.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ChannelBindingStore extends Context.Service<
  ChannelBindingStore,
  {
    /** The thread's binding, if it came through a channel. */
    readonly get: (
      threadId: ThreadId.Id,
    ) => Effect.Effect<Option.Option<ChannelBinding.ChannelBinding>, Failure>;
    /** The binding of an external conversation on a channel, if the conversation has a thread. */
    readonly findByConversation: (
      channelId: ChannelId.Id,
      conversationId: ChannelTransport.ExternalId,
    ) => Effect.Effect<Option.Option<ChannelBinding.ChannelBinding>, Failure>;
    /**
     * Reject a thread bound already, and a conversation bound to
     * another thread of the channel.
     */
    readonly insert: (
      record: ChannelBinding.ChannelBinding,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/channel/ChannelBindingStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: ChannelBindingStore["Service"],
): ChannelBindingStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (threadId) => Effect.flatMap(read("get", ThreadId.Id, threadId), driver.get),
    findByConversation: Effect.fn("ChannelBindingStore.findByConversation")(
      function* (channelId, conversationId) {
        return yield* driver.findByConversation(
          yield* read("findByConversation", ChannelId.Id, channelId),
          yield* read("findByConversation", ChannelTransport.ExternalId, conversationId),
        );
      },
    ),
    insert: (record) =>
      Effect.flatMap(write("insert", ChannelBinding.ChannelBinding, record), driver.insert),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(ChannelBinding.ChannelBinding));

/**
 * Channel bindings over the current workspace transaction, keyed by thread.
 */
const makeMemory = Effect.fn("ChannelBindingStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const driver: ChannelBindingStore["Service"] = {
    get: Effect.fn("ChannelBindingStore.memory.get")(
      function* (threadId) {
        return yield* rows.get((yield* read).records.of("channelBindings"), threadId);
      },
      Effect.mapError(storeFailure(Failure, "get")),
    ),
    findByConversation: Effect.fn("ChannelBindingStore.memory.findByConversation")(
      function* (channelId, conversationId) {
        const records = yield* rows.all((yield* read).records.of("channelBindings"));
        return Option.fromUndefinedOr(
          records.find(
            (record) => record.channelId === channelId && record.conversation.id === conversationId,
          ),
        );
      },
      Effect.mapError(storeFailure(Failure, "findByConversation")),
    ),
    insert: Effect.fn("ChannelBindingStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      const stored = yield* rows
        .all(space.records.of("channelBindings"))
        .pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (
        space.records.of("channelBindings").has(record.threadId) ||
        stored.some(
          (other) =>
            other.channelId === record.channelId &&
            other.conversation.id === record.conversation.id,
        )
      )
        return yield* new Conflict({
          operation: "insert",
          message: "Thread or conversation already bound",
        });
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("channelBindings").set(record.threadId, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `ChannelBindingStore` in process memory, over the workspace's `Store.MemoryBinding`.
 * Bindings are keyed by thread. It keeps what the contract leaves to storage: a thread binds to one
 * conversation and a channel's conversation to one thread, so a second binding of either conflicts.
 * `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ChannelBindingStore, makeMemory());
