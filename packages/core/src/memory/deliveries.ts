import { ChannelId, Delivery, DeliveryStore } from "../channel/index.ts";
import { Store } from "../journal/index.ts";
import { Thread } from "../thread/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Delivery.Record));
const rows = Rows.make(Schema.fromJsonString(Delivery.Record));

/** Delivery records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Deliveries.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
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
        return yield* rows.get((yield* read).records.of("deliveries"), id);
      },
      Effect.mapError(storeFailure(DeliveryStore, "get")),
    ),
    listRequestedByThread: Effect.fn("Deliveries.listRequestedByThread")(
      function* (input) {
        const threadId = yield* Schema.decodeEffect(Thread.Id)(input);
        const records = yield* rows.all((yield* read).records.of("deliveries"));
        return records
          .filter((record) => record.threadId === threadId && record.status === "requested")
          .toSorted(
            (left, right) => left.sequence - right.sequence || compareBinary(left.id, right.id),
          );
      },
      Effect.mapError(storeFailure(DeliveryStore, "listRequestedByThread")),
    ),
    findByExternalMessage: Effect.fn("Deliveries.findByExternalMessage")(
      function* (channelInput, conversationInput, messageInput) {
        const channelId = yield* Schema.decodeEffect(ChannelId.Id)(channelInput);
        const conversationId = yield* Schema.decodeEffect(Schema.NonEmptyString)(conversationInput);
        const externalMessageId = yield* Schema.decodeEffect(Schema.NonEmptyString)(messageInput);
        const records = yield* rows.all((yield* read).records.of("deliveries"));
        return Option.fromUndefinedOr(
          records.find(
            (record) =>
              record.channelId === channelId &&
              record.conversationId === conversationId &&
              record.externalMessageId === externalMessageId,
          ),
        );
      },
      Effect.mapError(storeFailure(DeliveryStore, "findByExternalMessage")),
    ),
    insert: Effect.fn("Deliveries.insert")(function* (input) {
      const record = yield* valid("insert", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(DeliveryStore, "insert")));
      if (space.records.of("deliveries").has(record.id))
        return yield* new DeliveryStore.Conflict({
          operation: "insert",
          message: "Delivery ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(DeliveryStore, "insert")));
      space.records.of("deliveries").set(record.id, row);
    }),
    update: Effect.fn("Deliveries.update")(function* (input) {
      const record = yield* valid("update", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(DeliveryStore, "update")));
      const found = yield* rows
        .get(space.records.of("deliveries"), record.id)
        .pipe(Effect.mapError(storeFailure(DeliveryStore, "update")));
      if (Option.isNone(found))
        return yield* new DeliveryStore.Conflict({
          operation: "update",
          message: "Expected a stored delivery",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(DeliveryStore, "update")));
      space.records.of("deliveries").set(record.id, row);
    }),
  });
});

/** Provide delivery storage over the caller's binding. @category layers */
export const layer = Layer.effect(DeliveryStore.Service, make());

export * as Deliveries from "./deliveries.ts";
