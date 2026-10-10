import { ChannelId, Delivery, DeliveryStore } from "@amends-dev/core/channel";
import { Store } from "@amends-dev/core/journal";
import { Thread } from "@amends-dev/core/thread";
import { and, asc, eq, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { channelDeliveries } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Delivery.Record));
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
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(channelDeliveries.workspaceId, workspaceId);
  /** Validate a record for this workspace before writing it. */
  const valid = (operation: string, input: Delivery.Record) =>
    Effect.gen(function* () {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(DeliveryStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new DeliveryStore.Conflict({
          operation,
          message: "Expected a delivery in this workspace",
        });
      return record;
    });
  return DeliveryStore.Service.of({
    get: Effect.fn("Deliveries.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Delivery.Id)(input);
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
      function* (input) {
        const threadId = yield* Schema.decodeEffect(Thread.Id)(input);
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
      function* (channelInput, conversationInput, messageInput) {
        const channelId = yield* Schema.decodeEffect(ChannelId.Id)(channelInput);
        const conversationId = yield* Schema.decodeEffect(Schema.NonEmptyString)(conversationInput);
        const externalMessageId = yield* Schema.decodeEffect(Schema.NonEmptyString)(messageInput);
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
    insert: Effect.fn("Deliveries.insert")(function* (input) {
      const record = yield* valid("insert", input);
      yield* guard(db.insert(channelDeliveries).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(DeliveryStore, "insert")),
      );
    }),
    update: Effect.fn("Deliveries.update")(function* (input) {
      const record = yield* valid("update", input);
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
  });
});

/** Provide delivery storage over the caller's binding. @category layers */
export const layer = Layer.effect(DeliveryStore.Service, make());

export * as Deliveries from "./deliveries.ts";
