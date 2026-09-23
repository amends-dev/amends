/**
 * One host's connection to memory storage, like one database connection: the host's writers
 * take turns on it, whichever workspace they write.
 */
import { Context, Effect, Layer, Semaphore } from "effect";
import { MemoryDatabase } from "./database.ts";

export interface Interface {
  readonly database: MemoryDatabase.Interface;
  /** One permit: held for the whole of each of this host's transactions. */
  readonly gate: Semaphore.Semaphore;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/storage-memory/connection/Service",
) {}

/**
 * Connect to the caller's storage.
 *
 * @category constructors
 */
export const make = Effect.fn("MemoryConnection.make")(function* () {
  return Service.of({ database: yield* MemoryDatabase.Service, gate: yield* Semaphore.make(1) });
});

/**
 * Provide a new connection to the caller's storage.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as MemoryConnection from "./connection.ts";
