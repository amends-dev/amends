import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { TurnFacts } from "./facts.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";

const conflict = (message: string) => new TurnStore.Conflict({ operation: "project", message });

/** The stored turn a fact changes, in this workspace. */
const stored = Effect.fnUntraced(function* (payload: {
  readonly workspaceId: Turn.Record["workspaceId"];
  readonly turnId: Turn.Id;
}) {
  const store = yield* TurnStore.Service;
  if (store.workspaceId !== payload.workspaceId)
    return yield* conflict("Fact belongs to another workspace");
  const found = yield* store.get(payload.turnId);
  if (Option.isNone(found)) return yield* conflict("Expected a turn in this workspace");
  return { store, turn: found.value };
});

export const definition = Projection.make("turns", { version: 2 })
  .on(
    TurnFacts.Created,
    Effect.fn("TurnProjection.created")(function* ({ payload }) {
      const store = yield* TurnStore.Service;
      if (store.workspaceId !== payload.workspaceId)
        return yield* conflict("Fact belongs to another workspace");
      const { notificationIds: _, ...record } = payload;
      yield* store.insert(record);
    }),
  )
  .on(
    TurnFacts.Retried,
    Effect.fn("TurnProjection.retried")(function* ({ payload }) {
      const store = yield* TurnStore.Service;
      if (store.workspaceId !== payload.workspaceId)
        return yield* conflict("Fact belongs to another workspace");
      yield* store.insert(payload);
    }),
  )
  .on(
    TurnFacts.InputAccepted,
    Effect.fn("TurnProjection.inputAccepted")(function* ({ payload }) {
      const { store, turn } = yield* stored(payload);
      yield* store.update(
        Turn.change(turn, { acceptedThroughSequence: payload.acceptedThroughSequence }),
      );
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
    TurnFacts.InputIncorporated,
    Effect.fn("TurnProjection.inputIncorporated")(function* ({ payload }) {
      const { store, turn } = yield* stored(payload);
      yield* store.update(
        Turn.change(turn, { incorporatedThroughSequence: payload.incorporatedThroughSequence }),
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
        Turn.change(turn, { status: "cancelled", finishedAt: payload.finishedAt }),
      );
    }),
  );

export * as TurnProjection from "./projection.ts";
