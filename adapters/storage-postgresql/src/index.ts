import { Layer } from "effect";
import { PostgresAccounts } from "./accounts.ts";
import { PostgresDirectory } from "./directory.ts";
import { PostgresStorage } from "./storage.ts";

export { PostgresAccounts } from "./accounts.ts";
export { PostgresClusterStorage } from "./cluster-storage.ts";
export { PostgresDatabase } from "./database.ts";
export { PostgresDirectory } from "./directory.ts";
export { PostgresStorage } from "./storage.ts";

/**
 * The gateway contracts this adapter implements, over one connected database: workspace
 * storage, with its signal hub, the directory, and the host's accounts.
 * A host provides PostgresDatabase.layer(config) and cryptography beneath, and the gateway above.
 *
 * @category layers
 */
export const layer = (options: PostgresStorage.Options = {}) =>
  Layer.mergeAll(PostgresStorage.layer(options), PostgresDirectory.layer, PostgresAccounts.layer);
