import { Layer } from "effect";
import { MemoryAccounts } from "./accounts.ts";
import { MemoryConnection } from "./connection.ts";
import { MemoryDirectory } from "./directory.ts";
import { MemoryStorage } from "./storage.ts";

export { MemoryAccounts } from "./accounts.ts";
export { MemoryDatabase } from "./database.ts";
export { MemoryDirectory } from "./directory.ts";
export { MemoryStorage } from "./storage.ts";

/**
 * The gateway contracts this adapter implements, over one new connection to storage: workspace
 * storage, with the signal hub every host over the same storage shares, the directory, and the
 * host's accounts. A host provides MemoryDatabase.layer and cryptography beneath, and the gateway
 * above; each further build of this layer over the same storage is another host.
 *
 * @category layers
 */
export const layer = Layer.mergeAll(
  MemoryStorage.layer,
  MemoryDirectory.layer,
  MemoryAccounts.layer,
).pipe(Layer.provide(MemoryConnection.layer));
