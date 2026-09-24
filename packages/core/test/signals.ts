import { Effect, Layer, PubSub, Stream } from "effect";
import type { Signal } from "../src/signal/signal.ts";
import { Signals } from "../src/signal/signals.ts";
import type { WorkspaceId } from "../src/workspace/id.ts";

/** Signals within one test process: subscribers receive what is published after they register. */
export const make = Effect.fnUntraced(function* (workspaceId: WorkspaceId.Id) {
  const hub = yield* PubSub.unbounded<Signal.Value>();
  return Signals.Service.of({
    workspaceId,
    publish: (signal) => PubSub.publish(hub, signal).pipe(Effect.asVoid),
    subscribe: Effect.map(PubSub.subscribe(hub), Stream.fromSubscription),
  });
});

/** Provide in-process signals for one workspace. */
export const layer = (workspaceId: WorkspaceId.Id) =>
  Layer.effect(Signals.Service, make(workspaceId));

export * as TestSignals from "./signals.ts";
