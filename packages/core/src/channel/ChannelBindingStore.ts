/**
 * The storage contract for channel bindings, which every storage adapter implements and
 * `ChannelProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { ChannelTransport } from "@amends-dev/channel";
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/Store.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as ChannelBinding from "./ChannelBinding.ts";
import * as ChannelId from "./ChannelId.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";

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
    ) => Effect.Effect<Option.Option<ChannelBinding.Record>, Failure>;
    /** The binding of an external conversation on a channel, if the conversation has a thread. */
    readonly findByConversation: (
      channelId: ChannelId.Id,
      conversationId: ChannelTransport.ExternalId,
    ) => Effect.Effect<Option.Option<ChannelBinding.Record>, Failure>;
    /**
     * Reject a thread bound already, and a conversation bound to
     * another thread of the channel.
     */
    readonly insert: (
      record: ChannelBinding.Record,
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
      Effect.flatMap(write("insert", ChannelBinding.Record, record), driver.insert),
  };
};
