import { Layer } from "effect";
import { MemoryConnection } from "./connection.ts";
import { MemoryDirectory } from "./directory.ts";
import { MemorySignals } from "./signals.ts";
import { MemoryStorage } from "./storage.ts";

export { MemoryDatabase } from "./database.ts";
export { MemoryDirectory } from "./directory.ts";
export { MemorySignals } from "./signals.ts";
export { MemoryStorage } from "./storage.ts";

/**
 * The gateway contracts this adapter implements, over one new connection to storage: workspace
 * storage, the directory, and the signal hub, which every host over the same storage shares.
 * A host provides MemoryDatabase.layer beneath, and the gateway above; each further
 * build of this layer over the same storage is another host.
 *
 * @category layers
 */
export const layer = Layer.mergeAll(
  MemoryStorage.layer,
  MemoryDirectory.layer,
  MemorySignals.layer,
).pipe(Layer.provide(MemoryConnection.layer));
