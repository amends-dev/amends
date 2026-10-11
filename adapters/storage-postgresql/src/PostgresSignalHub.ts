import { SignalHub } from "@amends-dev/core/signal";
import { Effect, Layer } from "effect";
import * as Binding from "./Binding.ts";

/**
 * The workspace's signals, between every process over the same database, relayed with `NOTIFY`
 * on the pool's notice channel. A signal published here reaches this process's subscribers the
 * same way, through the listener; nothing is stored, and signals sent while a listener reconnects
 * are missed.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresSignalHub.make")(function* () {
  const { workspaceId, database } = yield* Binding.Binding;
  return SignalHub.SignalHub.of({
    publish: database.notices.publishSignal,
    subscribe: database.notices.subscribeSignals(workspaceId),
  });
});

/**
 * Provide SignalHub.SignalHub using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(SignalHub.SignalHub, make());
