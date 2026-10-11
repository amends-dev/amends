import { Layer } from "effect";
import * as PostgresAccounts from "./accounts.ts";
import * as PostgresDirectory from "./directory.ts";
import * as PostgresSignInStorage from "./sign-in-storage.ts";
import * as PostgresWorkspaceStorage from "./workspace-storage.ts";

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
