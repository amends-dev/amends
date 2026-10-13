/**
 * The PostgreSQL driver for `DeliveryStore.DeliveryStore`, over the `channel_deliveries` table: one
 * row per delivery of a message to a conversation, with a check that each status holds its own
 * columns. A thread's requested deliveries read through a partial index by sequence, and an echo is
 * recognized through the index by channel, conversation, and external message ID.
 * `DeliveryStore.make` checks every input before the driver sees it, so the driver keeps only what
 * storage keeps: the primary key rejects a reused ID, and an update that finds no row is rejected.
 * Every statement is scoped to the binding's workspace and runs under its `guard`, which lets a
 * read join the caller's transaction and requires one for a write.
 *
 * @since 0.1.0
 */

import { Delivery, DeliveryStore } from "@amends-dev/core/channel"
import { StoreError } from "@amends-dev/core/journal"
import { and, asc, eq, sql } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./Binding.ts"
import { storeError } from "./internal/errors.ts"
import { channelDeliveries } from "./internal/schema.ts"

const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...Delivery.Delivery.fields,
      requestedAt: Schema.DateTimeUtcFromDate,
      finishedAt: Schema.NullOr(Schema.DateTimeUtcFromDate)
    })
  )
)
const toRow = (record: Delivery.Delivery): typeof channelDeliveries.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  channelId: record.channelId,
  threadId: record.threadId,
  groupId: record.groupId,
  conversationId: record.conversationId,
  messageId: record.messageId,
  sequence: record.sequence,
  status: record.status,
  externalMessageId: record.externalMessageId,
  attempts: record.attempts,
  failure: record.failure,
  requestedAt: DateTime.toDate(record.requestedAt),
  finishedAt: record.finishedAt === null ? null : DateTime.toDate(record.finishedAt)
})

/**
 * Builds the delivery store for the binding's workspace: this module's driver inside
 * `DeliveryStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Deliveries.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = eq(channelDeliveries.workspaceId, workspaceId)
  const driver: DeliveryStore.DeliveryStore["Service"] = {
    get: Effect.fn("Deliveries.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(channelDeliveries)
            .where(and(inWorkspace, eq(channelDeliveries.id, id)))
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("DeliveryStore", "get"))
    ),
    listRequestedByThread: Effect.fn("Deliveries.listRequestedByThread")(
      function* (threadId) {
        return yield* guard(
          db
            .select()
            .from(channelDeliveries)
            .where(
              and(inWorkspace, eq(channelDeliveries.threadId, threadId), eq(channelDeliveries.status, "requested"))
            )
            .orderBy(asc(channelDeliveries.sequence), asc(sql`${channelDeliveries.id} COLLATE "C"`))
        ).pipe(Effect.flatMap(decodeRows))
      },
      Effect.mapError(StoreError.failed("DeliveryStore", "listRequestedByThread"))
    ),
    findByExternalMessage: Effect.fn("Deliveries.findByExternalMessage")(
      function* (channelId, conversationId, externalMessageId) {
        return yield* guard(
          db
            .select()
            .from(channelDeliveries)
            .where(
              and(
                inWorkspace,
                eq(channelDeliveries.channelId, channelId),
                eq(channelDeliveries.conversationId, conversationId),
                eq(channelDeliveries.externalMessageId, externalMessageId)
              )
            )
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("DeliveryStore", "findByExternalMessage"))
    ),
    insert: Effect.fn("Deliveries.insert")(function* (record) {
      yield* guard(db.insert(channelDeliveries).values(toRow(record)), true).pipe(
        Effect.mapError(storeError("DeliveryStore", "insert"))
      )
    }),
    update: Effect.fn("Deliveries.update")(function* (record) {
      const updated = yield* guard(
        db
          .update(channelDeliveries)
          .set(toRow(record))
          .where(and(inWorkspace, eq(channelDeliveries.id, record.id)))
          .returning({ id: channelDeliveries.id }),
        true
      ).pipe(Effect.mapError(storeError("DeliveryStore", "update")))
      if (updated.length === 0)
        return yield* StoreError.rejected("DeliveryStore", "update", "Expected a stored delivery")
    })
  }
  return DeliveryStore.make(workspaceId, driver)
})

/**
 * Provides `DeliveryStore.DeliveryStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(DeliveryStore.DeliveryStore, make())
