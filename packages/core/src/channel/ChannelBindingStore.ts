/**
 * The storage contract for channel bindings, which every storage adapter implements and
 * `ChannelProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import type { ChannelTransport } from "@amends/connection";
import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { ThreadId } from "../thread/ThreadId.ts";
import type { ChannelBinding } from "./ChannelBinding.ts";
import type { ChannelId } from "./ChannelId.ts";

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
   * Reject malformed or foreign records, a thread bound already, and a conversation bound to
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
  "@amends/core/channel/ChannelBindingStore",
) {}

export * as ChannelBindingStore from "./ChannelBindingStore.ts";
