import { Delivery, DeliveryStore } from "@amends-dev/core/channel";
import { and, asc, eq, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import * as Binding from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { channelDeliveries } from "./schema.ts";

const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...Delivery.Record.fields,
      requestedAt: Schema.DateTimeUtcFromDate,
      finishedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    }),
  ),
);
const toRow = (record: Delivery.Record): typeof channelDeliveries.$inferInsert => ({
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
  finishedAt: record.finishedAt === null ? null : DateTime.toDate(record.finishedAt),
});

/** Delivery records in the workspace's database. @category constructors */
export const make = Effect.fn("Deliveries.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(channelDeliveries.workspaceId, workspaceId);
  const driver: DeliveryStore.DeliveryStore["Service"] = {
    get: Effect.fn("Deliveries.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(channelDeliveries)
            .where(and(inWorkspace, eq(channelDeliveries.id, id))),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(DeliveryStore, "get")),
    ),
    listRequestedByThread: Effect.fn("Deliveries.listRequestedByThread")(
      function* (threadId) {
        return yield* guard(
          db
            .select()
            .from(channelDeliveries)
            .where(
              and(
                inWorkspace,
                eq(channelDeliveries.threadId, threadId),
                eq(channelDeliveries.status, "requested"),
              ),
            )
            .orderBy(
              asc(channelDeliveries.sequence),
              asc(sql`${channelDeliveries.id} COLLATE "C"`),
            ),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(DeliveryStore, "listRequestedByThread")),
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
                eq(channelDeliveries.externalMessageId, externalMessageId),
              ),
            ),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(DeliveryStore, "findByExternalMessage")),
    ),
    insert: Effect.fn("Deliveries.insert")(function* (record) {
      yield* guard(db.insert(channelDeliveries).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(DeliveryStore, "insert")),
      );
    }),
    update: Effect.fn("Deliveries.update")(function* (record) {
      const updated = yield* guard(
        db
          .update(channelDeliveries)
          .set(toRow(record))
          .where(and(inWorkspace, eq(channelDeliveries.id, record.id)))
          .returning({ id: channelDeliveries.id }),
        true,
      ).pipe(Effect.mapError(storeError(DeliveryStore, "update")));
      if (updated.length === 0)
        return yield* new DeliveryStore.Conflict({
          operation: "update",
          message: "Expected a stored delivery",
        });
    }),
  };
  return DeliveryStore.make(workspaceId, driver);
});

/** Provide delivery storage over the caller's binding. @category layers */
export const layer = Layer.effect(DeliveryStore.DeliveryStore, make());
