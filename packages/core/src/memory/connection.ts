/**
 * One host's connection to memory storage, like one database connection: the host's writers
 * take turns on it, whichever workspace they write.
 */
import { Context, Effect, Layer, Semaphore } from "effect";
import * as MemoryDatabase from "./database.ts";

export class MemoryConnection extends Context.Service<
  MemoryConnection,
  {
    readonly database: MemoryDatabase.MemoryDatabase["Service"];
    /** One permit: held for the whole of each of this host's transactions. */
    readonly gate: Semaphore.Semaphore;
  }
>()("@amends-dev/core/memory/connection/Service") {}

/**
 * Connect to the caller's storage.
 *
 * @category constructors
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
 */
export const layer = Layer.effect(MemoryConnection, make());
