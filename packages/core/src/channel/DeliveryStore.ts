/**
 * The storage contract for deliveries, which every storage adapter implements and
 * `DeliveryProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */

import { ChannelTransport } from "@amends-dev/channel"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as Store from "../journal/Store.ts"
import * as StoreError from "../journal/StoreError.ts"
import * as StoreInput from "../journal/StoreInput.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as ChannelId from "./ChannelId.ts"
import * as Delivery from "./Delivery.ts"
import * as DeliveryId from "./DeliveryId.ts"

/**
 * The delivery store, bound to one workspace by the host.
 *
 * What a storage adapter implements for deliveries.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class DeliveryStore extends Context.Service<
  DeliveryStore,
  {
    readonly get: (id: DeliveryId.DeliveryId) => Effect.Effect<Option.Option<Delivery.Delivery>, StoreError.StoreError>
    /** The thread's deliveries not yet sent or failed, by their messages' positions, then by id. */
    readonly listRequestedByThread: (
      threadId: ThreadId.ThreadId
    ) => Effect.Effect<ReadonlyArray<Delivery.Delivery>, StoreError.StoreError>
    /**
     * The delivery that posted the message the external system knows as `externalMessageId` in a
     * conversation on a channel, if one did: what tells a post of our own, received back, from a
     * message to take in.
     */
    readonly findByExternalMessage: (
      channelId: ChannelId.ChannelId,
      conversationId: ChannelTransport.ExternalId,
      externalMessageId: ChannelTransport.ExternalId
    ) => Effect.Effect<Option.Option<Delivery.Delivery>, StoreError.StoreError>
    /** Reject a reused id. Never upsert. */
    readonly insert: (record: Delivery.Delivery) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /** Replace a stored delivery; a missing record is rejected. */
    readonly update: (record: Delivery.Delivery) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
  }
>()("@amends-dev/core/channel/DeliveryStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.WorkspaceId,
  driver: DeliveryStore["Service"]
): DeliveryStore["Service"] => {
  const read = StoreInput.read("DeliveryStore")
  const write = StoreInput.write("DeliveryStore", workspaceId)
  return {
    get: (id) => Effect.flatMap(read("get", DeliveryId.DeliveryId, id), driver.get),
    listRequestedByThread: (threadId) =>
      Effect.flatMap(read("listRequestedByThread", ThreadId.ThreadId, threadId), driver.listRequestedByThread),
    findByExternalMessage: Effect.fn("DeliveryStore.findByExternalMessage")(
      function* (channelId, conversationId, externalMessageId) {
        return yield* driver.findByExternalMessage(
          yield* read("findByExternalMessage", ChannelId.ChannelId, channelId),
          yield* read("findByExternalMessage", ChannelTransport.ExternalId, conversationId),
          yield* read("findByExternalMessage", ChannelTransport.ExternalId, externalMessageId)
        )
      }
    ),
    insert: (record) => Effect.flatMap(write("insert", Delivery.Delivery, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Delivery.Delivery, record), driver.update)
  }
}

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Delivery.Delivery))

/**
 * Delivery records over the current workspace transaction.
 */
const makeMemory = Effect.fn("DeliveryStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding
  const driver: DeliveryStore["Service"] = {
    get: Effect.fn("DeliveryStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("deliveries"), id)
      },
      Effect.mapError(StoreError.failed("DeliveryStore", "get"))
    ),
    listRequestedByThread: Effect.fn("DeliveryStore.memory.listRequestedByThread")(
      function* (threadId) {
        const records = yield* rows.all((yield* read).records.of("deliveries"))
        return records
          .filter((record) => record.threadId === threadId && record.status === "requested")
          .toSorted((left, right) => left.sequence - right.sequence || MemoryDatabase.compareBinary(left.id, right.id))
      },
      Effect.mapError(StoreError.failed("DeliveryStore", "listRequestedByThread"))
    ),
    findByExternalMessage: Effect.fn("DeliveryStore.memory.findByExternalMessage")(
      function* (channelId, conversationId, externalMessageId) {
        const records = yield* rows.all((yield* read).records.of("deliveries"))
        return Option.fromUndefinedOr(
          records.find(
            (record) =>
              record.channelId === channelId &&
              record.conversationId === conversationId &&
              record.externalMessageId === externalMessageId
          )
        )
      },
      Effect.mapError(StoreError.failed("DeliveryStore", "findByExternalMessage"))
    ),
    insert: Effect.fn("DeliveryStore.memory.insert")(
      function* (record) {
        const space = yield* write
        if (space.records.of("deliveries").has(record.id))
          return yield* StoreError.rejected("DeliveryStore", "insert", "Delivery ID already exists")
        const row = yield* rows.encode(record)
        space.records.of("deliveries").set(record.id, row)
      },
      Effect.mapError(StoreError.failed("DeliveryStore", "insert"))
    ),
    update: Effect.fn("DeliveryStore.memory.update")(
      function* (record) {
        const space = yield* write
        const found = yield* rows.get(space.records.of("deliveries"), record.id)
        if (Option.isNone(found))
          return yield* StoreError.rejected("DeliveryStore", "update", "Expected a stored delivery")
        const row = yield* rows.encode(record)
        space.records.of("deliveries").set(record.id, row)
      },
      Effect.mapError(StoreError.failed("DeliveryStore", "update"))
    )
  }
  return make(workspaceId, driver)
})

/**
 * Provide `DeliveryStore` in process memory, over the workspace's `Store.MemoryBinding`. It keeps
 * what the contract leaves to storage: a reused ID is rejected, and so is an update of a missing
 * delivery. A thread's requested deliveries list in sequence order, then by ID. `make` checks every
 * input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(DeliveryStore, makeMemory())
