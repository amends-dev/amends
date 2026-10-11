/**
 * One host's connection to memory storage, like one database connection: the host's writers
 * take turns on it, whichever workspace they write. `Binding` builds each workspace's view over
 * it, and the gateway's memory storage provides one to each host it composes.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Semaphore } from "effect";
import * as MemoryDatabase from "./MemoryDatabase.ts";

/**
 * The connection: the storage it reaches and the gate its transactions take turns on.
 * `Binding.make` takes the workspace's writer through the gate; `MemoryStores.layer` and the
 * gateway's memory workspace storage require it.
 *
 * @category services
 * @since 0.1.0
 */
export class MemoryConnection extends Context.Service<
  MemoryConnection,
  {
    /** The storage this host connected to, shared with every other host that did. */
    readonly database: MemoryDatabase.MemoryDatabase["Service"];
    /** One permit: held for the whole of each of this host's transactions. */
    readonly gate: Semaphore.Semaphore;
  }
>()("@amends-dev/core/memory/connection/Service") {}

/**
 * Connect to the caller's `MemoryDatabase`, with a gate of this connection's own.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("MemoryConnection.make")(function* () {
  return MemoryConnection.of({
    database: yield* MemoryDatabase.MemoryDatabase,
    gate: yield* Semaphore.make(1),
  });
});

/**
 * Provide a new connection to the caller's storage.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(MemoryConnection, make());
