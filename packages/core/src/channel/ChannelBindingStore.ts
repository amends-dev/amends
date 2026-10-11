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
import type { Store } from "../journal/store.ts";
import { ThreadId } from "../thread/ThreadId.ts";
import { ChannelBinding } from "./ChannelBinding.ts";
import { ChannelId } from "./ChannelId.ts";
import { StoreInput } from "../journal/StoreInput.ts";
import type { WorkspaceId } from "../workspace/id.ts";

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
 * What a storage adapter implements for bindings.
 *
 * @category services
 * @since 0.1.0
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export interface Interface {
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

/**
 * The binding store, bound to one workspace by the host.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/channel/ChannelBindingStore",
) {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.Id, driver: Interface): Interface => {
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

export * as ChannelBindingStore from "./ChannelBindingStore.ts";
