/**
 * The adapter in one layer: every gateway contract it implements over one connected database.
 * That is workspace storage with each workspace's signal hub, the workspace directory, the host's
 * accounts, and sign-in storage. The host provides `PostgresDatabase.layer` and cryptography
 * beneath it, and the gateway above.
 *
 * @since 0.1.0
 */
import * as Layer from "effect/Layer";
import * as PostgresAccounts from "./PostgresAccounts.ts";
import * as PostgresDirectory from "./PostgresDirectory.ts";
import * as PostgresSignInStorage from "./PostgresSignInStorage.ts";
import * as PostgresWorkspaceStorage from "./PostgresWorkspaceStorage.ts";

/**
 * What `layer` takes: the limits on each workspace's transactions and reads, and the key that
 * seals connections' credentials.
 *
 * @category options
 * @since 0.1.0
 */
export type Options = PostgresWorkspaceStorage.Options;

/**
 * The gateway contracts this adapter implements, over one connected database: workspace
 * storage, with its signal hub, the directory, the host's accounts, and sign-in storage.
 * A host provides `PostgresDatabase.layer(config)` and cryptography beneath, and the gateway above.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (options: Options = {}) =>
  Layer.mergeAll(
    PostgresWorkspaceStorage.layer(options),
    PostgresDirectory.layer,
    PostgresAccounts.layer,
    PostgresSignInStorage.layer,
  );
