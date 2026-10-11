import { Effect, Option } from "effect";
import * as Projection from "../journal/projection.ts";
import * as TurnFacts from "./facts.ts";
import * as TurnStore from "./store.ts";
import * as Turn from "./turn.ts";

/** Change the stored turn a fact names, as `changes` says of it as it stands. */
const update = Effect.fnUntraced(function* (
  turnId: Turn.Id,
  changes: (turn: Turn.Record) => Partial<Turn.Record>,
) {
  const turnStore = yield* TurnStore.TurnStore;
  const found = yield* turnStore.get(turnId);
  if (Option.isNone(found)) return yield* Effect.die("A changed turn is missing");
  yield* turnStore.update(Turn.change(found.value, changes(found.value)));
});

export const definition = Projection.make("turns", { version: 4 })
  .on(
    TurnFacts.Created,
    Effect.fn("TurnProjection.created")(function* ({ payload }) {
      const turnStore = yield* TurnStore.TurnStore;
      const { notificationIds: _, ...record } = payload;
      yield* turnStore.insert(record);
    }),
  )
  .on(
    TurnFacts.Retried,
    Effect.fn("TurnProjection.retried")(function* ({ payload }) {
      const turnStore = yield* TurnStore.TurnStore;
      yield* turnStore.insert(payload);
    }),
  )
  .on(
    TurnFacts.Started,
    Effect.fn("TurnProjection.started")(function* ({ payload }) {
      yield* update(payload.turnId, (turn) => ({
        status: turn.status === "queued" ? "running" : turn.status,
        selection: payload.selection,
        startedAt: payload.startedAt,
      }));
    }),
  )
  .on(
    TurnFacts.CancelRequested,
    Effect.fn("TurnProjection.cancelRequested")(function* ({ payload }) {
      yield* update(payload.turnId, () => ({ status: "cancelling", cancelReason: payload.reason }));
    }),
  )
  .on(
    TurnFacts.Completed,
    Effect.fn("TurnProjection.completed")(function* ({ payload }) {
      yield* update(payload.turnId, () => ({
        status: "completed",
        messageIds: payload.messageIds,
        finishedAt: payload.finishedAt,
      }));
    }),
  )
  .on(
    TurnFacts.Failed,
    Effect.fn("TurnProjection.failed")(function* ({ payload }) {
      yield* update(payload.turnId, () => ({
        status: "failed",
        failure: payload.reason,
        finishedAt: payload.finishedAt,
      }));
    }),
  )
  .on(
    TurnFacts.Cancelled,
    Effect.fn("TurnProjection.cancelled")(function* ({ payload }) {
      yield* update(payload.turnId, () => ({
        status: "cancelled",
        cancelReason: payload.cancelReason,
        finishedAt: payload.finishedAt,
      }));
    }),
  );
