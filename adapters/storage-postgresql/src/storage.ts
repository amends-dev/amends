import { Layer } from "effect";
import { PostgresAccounts } from "./accounts.ts";
import { PostgresDirectory } from "./directory.ts";
import { PostgresSignInStorage } from "./sign-in-storage.ts";
import { PostgresWorkspaceStorage } from "./workspace-storage.ts";

export type Options = PostgresWorkspaceStorage.Options;

/**
 * The gateway contracts this adapter implements, over one connected database: workspace
 * storage, with its signal hub, the directory, the host's accounts, and sign-in storage.
 * A host provides PostgresDatabase.layer(config) and cryptography beneath, and the gateway above.
 *
 * @category layers
 */
export const layer = (options: Options = {}) =>
  Layer.mergeAll(
    PostgresWorkspaceStorage.layer(options),
    PostgresDirectory.layer,
    PostgresAccounts.layer,
    PostgresSignInStorage.layer,
  );

export * as PostgresStorage from "./storage.ts";
