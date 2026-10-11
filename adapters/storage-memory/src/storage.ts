import { Layer } from "effect";
import { MemoryAccounts } from "./accounts.ts";
import { MemoryConnection } from "./connection.ts";
import { MemoryDirectory } from "./directory.ts";
import { MemorySignInStorage } from "./sign-in-storage.ts";
import { MemoryWorkspaceStorage } from "./workspace-storage.ts";

/**
 * The gateway contracts this adapter implements, over one new connection to storage: workspace
 * storage, with the signal hub every host over the same storage shares, the directory, the host's
 * accounts, and sign-in storage. A host provides MemoryDatabase.layer and cryptography beneath,
 * and the gateway above; each further build of this layer over the same storage is another host.
 *
 * @category layers
 */
export const layer = Layer.mergeAll(
  MemoryWorkspaceStorage.layer,
  MemoryDirectory.layer,
  MemoryAccounts.layer,
  MemorySignInStorage.layer,
).pipe(Layer.provide(MemoryConnection.layer));

export * as MemoryStorage from "./storage.ts";
