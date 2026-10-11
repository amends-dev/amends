import { Delivery, DeliveryStore } from "../channel/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

const rows = Rows.make(Schema.fromJsonString(Delivery.Record));

/** Delivery records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Deliveries.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const driver: DeliveryStore.Interface = {
    get: Effect.fn("Deliveries.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("deliveries"), id);
      },
      Effect.mapError(storeFailure(DeliveryStore, "get")),
    ),
    listRequestedByThread: Effect.fn("Deliveries.listRequestedByThread")(
      function* (threadId) {
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
      function* (channelId, conversationId, externalMessageId) {
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
    insert: Effect.fn("Deliveries.insert")(function* (record) {
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
    update: Effect.fn("Deliveries.update")(function* (record) {
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
  };
  return DeliveryStore.make(workspaceId, driver);
});

/** Provide delivery storage over the caller's binding. @category layers */
export const layer = Layer.effect(DeliveryStore.Service, make());

export * as Deliveries from "./deliveries.ts";
