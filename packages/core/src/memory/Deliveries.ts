/**
 * The memory implementation of `DeliveryStore` from `../channel/DeliveryStore.ts`, over the
 * workspace's `Binding`. It keeps what the contract leaves to storage: a reused ID conflicts, and
 * so does an update of a missing delivery. A thread's requested deliveries list in sequence order,
 * then by ID. `DeliveryStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { Delivery, DeliveryStore } from "../channel/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";
import { compareBinary } from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Delivery.Record));

/**
 * Delivery records over the current workspace transaction.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Deliveries.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const driver: DeliveryStore.DeliveryStore["Service"] = {
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

/**
 * Provide delivery storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(DeliveryStore.DeliveryStore, make());
