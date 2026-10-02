import { Signals } from "@amends/core/signal";
import type { Signal } from "@amends/core/signal";
import type { Workspace } from "@amends/core/workspace";
import { WorkspaceSignals } from "@amends/gateway";
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
  const memoryDatabase = yield* MemoryDatabase.Service;
  const forWorkspace = (workspaceId: Workspace.Id) =>
    Signals.Service.of({
      publish: (signal) =>
        Effect.forEach(memoryDatabase.listeners.get(workspaceId) ?? [], (queue) =>
          Queue.offer(queue, signal),
        ).pipe(Effect.asVoid),
      subscribe: Effect.gen(function* () {
        const queue = yield* Queue.sliding<Signal.Value>(capacity);
        const listeners = memoryDatabase.listeners.get(workspaceId) ?? new Set();
        listeners.add(queue);
        memoryDatabase.listeners.set(workspaceId, listeners);
        yield* Effect.addFinalizer(() =>
          Effect.suspend(() => {
            listeners.delete(queue);
            if (listeners.size === 0) memoryDatabase.listeners.delete(workspaceId);
            return Queue.shutdown(queue);
          }),
        );
        return Stream.fromQueue(queue);
      }),
    });
  return WorkspaceSignals.Service.of({ forWorkspace });
});

/**
 * Provide the signal hub over the caller's storage.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceSignals.Service, make());

export * as MemorySignals from "./signals.ts";
