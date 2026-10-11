/**
 * The storage contract for deliveries, which every storage adapter implements and
 * `DeliveryProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { ChannelTransport } from "@amends-dev/channel";
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type { Store } from "../journal/store.ts";
import { ThreadId } from "../thread/ThreadId.ts";
import { ChannelId } from "./ChannelId.ts";
import { Delivery } from "./Delivery.ts";
import { StoreInput } from "../journal/StoreInput.ts";
import type { WorkspaceId } from "../workspace/id.ts";

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
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
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
  /** Reject a reused id. Never upsert. */
  readonly insert: (
    record: Delivery.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Replace a stored delivery; a missing record conflicts. */
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
    get: (id) => Effect.flatMap(read("get", Delivery.Id, id), driver.get),
    listRequestedByThread: (threadId) =>
      Effect.flatMap(
        read("listRequestedByThread", ThreadId.Id, threadId),
        driver.listRequestedByThread,
      ),
    findByExternalMessage: Effect.fn("DeliveryStore.findByExternalMessage")(
      function* (channelId, conversationId, externalMessageId) {
        return yield* driver.findByExternalMessage(
          yield* read("findByExternalMessage", ChannelId.Id, channelId),
          yield* read("findByExternalMessage", ChannelTransport.ExternalId, conversationId),
          yield* read("findByExternalMessage", ChannelTransport.ExternalId, externalMessageId),
        );
      },
    ),
    insert: (record) => Effect.flatMap(write("insert", Delivery.Record, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Delivery.Record, record), driver.update),
  };
};

export * as DeliveryStore from "./DeliveryStore.ts";
