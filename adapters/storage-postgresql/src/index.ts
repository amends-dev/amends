import { Layer } from "effect";
import { PostgresDirectory } from "./directory.ts";
import { PostgresSignals } from "./signals.ts";
import { PostgresStorage } from "./storage.ts";

export { PostgresClusterStorage } from "./cluster-storage.ts";
export { PostgresDatabase } from "./database.ts";
export { PostgresDirectory } from "./directory.ts";
export { PostgresSignals } from "./signals.ts";
export { PostgresStorage } from "./storage.ts";

/**
 * The gateway contracts this adapter implements, over one connected database: workspace
 * storage, the directory, and the signal hub.
 * A host provides PostgresDatabase.layer(config) beneath, and the gateway above.
 *
 * @category layers
 */
export const layer = (options: PostgresStorage.Options = {}) =>
  Layer.mergeAll(PostgresStorage.layer(options), PostgresDirectory.layer, PostgresSignals.layer);
