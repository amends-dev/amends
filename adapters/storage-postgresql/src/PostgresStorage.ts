/**
 * The adapter in one layer: every host contract it implements over one connected database.
 * That is workspace storage, the workspace directory, the host's accounts, sign-in storage, sync
 * storage, and the presence relay between the host's processes. The host provides `PostgresDatabase.layer` and cryptography beneath it, and the gateway
 * above.
 *
 * @since 0.1.0
 */

import * as Layer from "effect/Layer"
import * as PostgresAccounts from "./PostgresAccounts.ts"
import * as PostgresDirectory from "./PostgresDirectory.ts"
import * as PostgresPresenceRelay from "./PostgresPresenceRelay.ts"
import * as PostgresSignInStorage from "./PostgresSignInStorage.ts"
import * as PostgresSyncStorage from "./PostgresSyncStorage.ts"
import * as PostgresWorkspaceStorage from "./PostgresWorkspaceStorage.ts"

/**
 * What `layer` takes: the limits on each workspace's transactions and reads, and the key that
 * seals connections' credentials.
 *
 * @category options
 * @since 0.1.0
 */
export type Options = PostgresWorkspaceStorage.Options

/**
 * The host contracts this adapter implements, over one connected database: workspace storage, the
 * directory, the host's accounts, sign-in storage, sync storage, and the presence relay.
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
    PostgresSyncStorage.layer,
    PostgresPresenceRelay.layer
  )
