import { Layer } from "effect";
import { PostgresDirectory } from "./directory.ts";
import { PostgresStorage } from "./storage.ts";

export { Binding } from "./binding.ts";
export { PostgresDatabase } from "./database.ts";
export { PostgresDirectory } from "./directory.ts";
export { PostgresStorage } from "./storage.ts";
export * as schema from "./schema.ts";

/**
 * Both gateway contracts this adapter implements, over one connected database.
 * A host provides PostgresDatabase.layer(config) beneath, and the gateway above.
 *
 * @category layers
 */
export const layer = (options: PostgresStorage.Options = {}) =>
  Layer.mergeAll(PostgresStorage.layer(options), PostgresDirectory.layer);
