import { MemoryConnection } from "@amends-dev/core/memory";
import { Layer } from "effect";
import * as MemoryAccounts from "./accounts.ts";
import * as MemoryDirectory from "./directory.ts";
import * as MemorySignInStorage from "./sign-in-storage.ts";
import * as MemoryWorkspaceStorage from "./workspace-storage.ts";

/**
 * Every contract a host implements for the gateway, over one new connection to memory storage:
 * workspace storage, with the signal hub every host over the same storage shares, the directory,
 * the host's accounts, and sign-in storage. A host provides `MemoryDatabase.layer` and
 * cryptography beneath, and the gateway above; each further build of this layer over the same
 * storage is another host.
 *
 * @category layers
 */
export const layer = Layer.mergeAll(
  MemoryWorkspaceStorage.layer,
  MemoryDirectory.layer,
  MemoryAccounts.layer,
  MemorySignInStorage.layer,
).pipe(Layer.provide(MemoryConnection.layer));
