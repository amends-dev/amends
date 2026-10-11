import { Effect, Layer, PubSub, Stream } from "effect";
import type * as Signal from "../src/signal/Signal.ts";
import * as SignalHub from "../src/signal/SignalHub.ts";

/** Signals within one test process: subscribers receive what is published after they register. */
export const make = Effect.fnUntraced(function* () {
  const pubsub = yield* PubSub.unbounded<Signal.Signal>();
  return SignalHub.SignalHub.of({
    publish: (signal) => PubSub.publish(pubsub, signal).pipe(Effect.asVoid),
    subscribe: Effect.map(PubSub.subscribe(pubsub), Stream.fromSubscription),
  });
});

/** Provide an in-process signal hub for one workspace. */
export const layer = Layer.effect(SignalHub.SignalHub, make());
