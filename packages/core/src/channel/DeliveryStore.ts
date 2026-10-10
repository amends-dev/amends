/**
 * The storage contract for deliveries, which every storage adapter implements and
 * `DeliveryProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import type { ChannelTransport } from "@amends-dev/channel";
import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { ThreadId } from "../thread/ThreadId.ts";
import type { ChannelId } from "./ChannelId.ts";
import type { Delivery } from "./Delivery.ts";

/**
 * Storage failed while reading or writing deliveries.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("DeliveryStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused id, or a change
 * to a delivery that is missing.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("DeliveryStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * What a storage adapter implements for deliveries.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  readonly get: (id: Delivery.Id) => Effect.Effect<Option.Option<Delivery.Record>, Failure>;
  /** The thread's deliveries not yet sent or failed, by their messages' positions, then by id. */
  readonly listRequestedByThread: (
    threadId: ThreadId.Id,
  ) => Effect.Effect<ReadonlyArray<Delivery.Record>, Failure>;
  /**
   * The delivery that posted the message the external system knows as `externalMessageId` in a
   * conversation on a channel, if one did: what tells a post of our own, received back, from a
   * message to take in.
   */
  readonly findByExternalMessage: (
    channelId: ChannelId.Id,
    conversationId: ChannelTransport.ExternalId,
    externalMessageId: ChannelTransport.ExternalId,
  ) => Effect.Effect<Option.Option<Delivery.Record>, Failure>;
  /** Reject malformed or foreign records and reused ids. Never upsert. */
  readonly insert: (
    record: Delivery.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Replace a stored delivery; a missing, foreign, or malformed record conflicts. */
  readonly update: (
    record: Delivery.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

/**
 * The delivery store, bound to one workspace by the host.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/channel/DeliveryStore",
) {}

export * as DeliveryStore from "./DeliveryStore.ts";
