import { Signal, Signals } from "@amends/core/signal";
import type { Workspace } from "@amends/core/workspace";
import { SignalHub } from "@amends/gateway";
import { Effect, Layer, Option, Schema, Stream } from "effect";
import { PostgresDatabase } from "./database.ts";

const codec = Schema.toCodecJson(Signal.Value);
const encode = Schema.encodeEffect(codec);
const decode = Schema.decodeUnknownEffect(codec);

/**
 * Signals between every process over the same database, relayed with `NOTIFY` on the pool's
 * notice channel. A signal published here reaches this process's subscribers the same way, through
 * the listener; nothing is stored, and signals sent while a listener reconnects are missed.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresSignals.make")(function* () {
  const { notices } = yield* PostgresDatabase.Service;
  const forWorkspace = (workspaceId: Workspace.Id) =>
    Signals.Service.of({
      publish: (signal) =>
        encode(signal).pipe(
          Effect.flatMap((encoded) => notices.signal(workspaceId, encoded)),
          Effect.catchCause((cause) => Effect.logWarning("Signal not published", cause)),
        ),
      subscribe: Effect.map(notices.signals(workspaceId), (queue) =>
        Stream.fromQueue(queue).pipe(
          // A signal this version cannot read is skipped rather than ending the subscription.
          Stream.mapEffect((encoded) => Effect.option(decode(encoded))),
          Stream.filter(Option.isSome),
          Stream.map((signal) => signal.value),
        ),
      ),
    });
  return SignalHub.Service.of({ forWorkspace });
});

/**
 * Provide the signal hub over the caller's database.
 *
 * @category layers
 */
export const layer = Layer.effect(SignalHub.Service, make());

export * as PostgresSignals from "./signals.ts";
