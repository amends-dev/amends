import { Effect, Layer, PubSub, Stream } from "effect";
import type { Signal } from "../src/signal/signal.ts";
import { SignalHub } from "../src/signal/hub.ts";

/** Signals within one test process: subscribers receive what is published after they register. */
export const make = Effect.fnUntraced(function* () {
  const pubsub = yield* PubSub.unbounded<Signal.Value>();
  return SignalHub.Service.of({
    publish: (signal) => PubSub.publish(pubsub, signal).pipe(Effect.asVoid),
    subscribe: Effect.map(PubSub.subscribe(pubsub), Stream.fromSubscription),
  });
});

/** Provide an in-process signal hub for one workspace. */
export const layer = Layer.effect(SignalHub.Service, make());

export * as TestSignalHub from "./signal-hub.ts";
