/**
 * Keeps the delivery read model, `DeliveryStore`: a created delivery is inserted as its record,
 * without the notifications it settled, which the notification projection applies, and each end is
 * applied to the row from the fact alone, so the rows rebuild to the same state from the journal.
 *
 * @since 0.1.0
 */
import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { Delivery } from "./Delivery.ts";
import { DeliveryFacts } from "./DeliveryFacts.ts";
import { DeliveryStore } from "./DeliveryStore.ts";

/** Change the stored delivery a fact names, as `changes` says. */
const update = Effect.fnUntraced(function* (
  deliveryId: Delivery.Id,
  changes: Partial<Delivery.Record>,
) {
  const deliveryStore = yield* DeliveryStore.Service;
  const found = yield* deliveryStore.get(deliveryId);
  if (Option.isNone(found)) return yield* Effect.die("A changed delivery is missing");
  yield* deliveryStore.update(Delivery.change(found.value, changes));
});

/**
 * Inserts each delivery and applies each end.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("channel-delivery", { version: 1 })
  .on(
    DeliveryFacts.Created,
    Effect.fn("DeliveryProjection.created")(function* ({ payload }) {
      const deliveryStore = yield* DeliveryStore.Service;
      const { notificationIds: _, ...record } = payload;
      yield* deliveryStore.insert(record);
    }),
  )
  .on(
    DeliveryFacts.Sent,
    Effect.fn("DeliveryProjection.sent")(function* ({ payload }) {
      yield* update(payload.deliveryId, {
        status: "sent",
        externalMessageId: payload.externalMessageId,
        attempts: payload.attempts,
        finishedAt: payload.sentAt,
      });
    }),
  )
  .on(
    DeliveryFacts.Failed,
    Effect.fn("DeliveryProjection.failed")(function* ({ payload }) {
      yield* update(payload.deliveryId, {
        status: "failed",
        failure: payload.reason,
        attempts: payload.attempts,
        finishedAt: payload.failedAt,
      });
    }),
  );

export * as DeliveryProjection from "./DeliveryProjection.ts";
