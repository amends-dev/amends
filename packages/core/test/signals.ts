import { Effect, Layer, PubSub, Stream } from "effect";
import type { Signal } from "../src/signal/signal.ts";
import { Signals } from "../src/signal/signals.ts";

/** Signals within one test process: subscribers receive what is published after they register. */
export const make = Effect.fnUntraced(function* () {
  const hub = yield* PubSub.unbounded<Signal.Value>();
  return Signals.Service.of({
    publish: (signal) => PubSub.publish(hub, signal).pipe(Effect.asVoid),
    subscribe: Effect.map(PubSub.subscribe(hub), Stream.fromSubscription),
  });
});

/** Provide in-process signals for one workspace. */
export const layer = Layer.effect(Signals.Service, make());

export * as TestSignals from "./signals.ts";
