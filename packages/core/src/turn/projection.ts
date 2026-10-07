import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { TurnFacts } from "./facts.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";

/** The stored turn a fact changes, in this workspace. */
const stored = Effect.fnUntraced(function* (payload: {
  readonly workspaceId: Turn.Record["workspaceId"];
  readonly turnId: Turn.Id;
}) {
  const turnStore = yield* TurnStore.Service;
  const found = yield* turnStore.get(payload.turnId);
  if (Option.isNone(found)) return yield* Effect.die("A changed turn is missing");
  return { store: turnStore, turn: found.value };
});

export const definition = Projection.make("turns", { version: 4 })
  .on(
    TurnFacts.Created,
    Effect.fn("TurnProjection.created")(function* ({ payload }) {
      const turnStore = yield* TurnStore.Service;
      const { notificationIds: _, ...record } = payload;
      yield* turnStore.insert(record);
    }),
  )
  .on(
    TurnFacts.Retried,
    Effect.fn("TurnProjection.retried")(function* ({ payload }) {
      const turnStore = yield* TurnStore.Service;
      yield* turnStore.insert(payload);
    }),
  )
  .on(
    TurnFacts.Started,
    Effect.fn("TurnProjection.started")(function* ({ payload }) {
      const { store, turn } = yield* stored(payload);
      yield* store.update(
        Turn.change(turn, {
          status: turn.status === "queued" ? "running" : turn.status,
          selection: payload.selection,
          startedAt: payload.startedAt,
        }),
      );
    }),
  )
  .on(
    TurnFacts.CancelRequested,
    Effect.fn("TurnProjection.cancelRequested")(function* ({ payload }) {
      const { store, turn } = yield* stored(payload);
      yield* store.update(
        Turn.change(turn, { status: "cancelling", cancelReason: payload.reason }),
      );
    }),
  )
  .on(
    TurnFacts.Completed,
    Effect.fn("TurnProjection.completed")(function* ({ payload }) {
      const { store, turn } = yield* stored(payload);
      yield* store.update(
        Turn.change(turn, {
          status: "completed",
          messageIds: payload.messageIds,
          finishedAt: payload.finishedAt,
        }),
      );
    }),
  )
  .on(
    TurnFacts.Failed,
    Effect.fn("TurnProjection.failed")(function* ({ payload }) {
      const { store, turn } = yield* stored(payload);
      yield* store.update(
        Turn.change(turn, {
          status: "failed",
          failure: payload.reason,
          finishedAt: payload.finishedAt,
        }),
      );
    }),
  )
  .on(
    TurnFacts.Cancelled,
    Effect.fn("TurnProjection.cancelled")(function* ({ payload }) {
      const { store, turn } = yield* stored(payload);
      yield* store.update(
        Turn.change(turn, {
          status: "cancelled",
          cancelReason: payload.cancelReason,
          finishedAt: payload.finishedAt,
        }),
      );
    }),
  );

export * as TurnProjection from "./projection.ts";
