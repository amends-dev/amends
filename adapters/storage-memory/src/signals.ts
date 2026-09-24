import { Signals } from "@amends/core/signal";
import type { Signal } from "@amends/core/signal";
import type { Workspace } from "@amends/core/workspace";
import { SignalHub } from "@amends/gateway";
import { Effect, Layer, Queue, Stream } from "effect";
import { MemoryDatabase } from "./database.ts";

/** Signals a subscriber may fall behind by before it misses the oldest. */
const capacity = 256;

/**
 * Signals between every host over the same storage. Each subscriber has its own bounded queue,
 * and publishing offers to each of the workspace's subscribers at that moment; nothing is kept.
 *
 * @category constructors
 */
export const make = Effect.fn("MemorySignals.make")(function* () {
  const database = yield* MemoryDatabase.Service;
  const forWorkspace = (workspaceId: Workspace.Id) =>
    Signals.Service.of({
      workspaceId,
      publish: (signal) =>
        Effect.forEach(database.listeners.get(workspaceId) ?? [], (queue) =>
          Queue.offer(queue, signal),
        ).pipe(Effect.asVoid),
      subscribe: Effect.gen(function* () {
        const queue = yield* Queue.sliding<Signal.Value>(capacity);
        const listeners = database.listeners.get(workspaceId) ?? new Set();
        listeners.add(queue);
        database.listeners.set(workspaceId, listeners);
        yield* Effect.addFinalizer(() =>
          Effect.suspend(() => {
            listeners.delete(queue);
            if (listeners.size === 0) database.listeners.delete(workspaceId);
            return Queue.shutdown(queue);
          }),
        );
        return Stream.fromQueue(queue);
      }),
    });
  return SignalHub.Service.of({ forWorkspace });
});

/**
 * Provide the signal hub over the caller's storage.
 *
 * @category layers
 */
export const layer = Layer.effect(SignalHub.Service, make());

export * as MemorySignals from "./signals.ts";
