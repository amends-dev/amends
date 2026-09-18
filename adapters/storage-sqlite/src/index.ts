import { Layer } from "effect";
import { SqliteDirectory } from "./directory.ts";
import { SqliteStorage } from "./storage.ts";

export { Binding } from "./binding.ts";
export { SqliteDatabase } from "./database.ts";
export { SqliteDirectory } from "./directory.ts";
export { SqliteStorage } from "./storage.ts";

/**
 * Both gateway contracts this adapter implements, over one open database.
 * A host provides SqliteDatabase.layer(filename) beneath, and the gateway above.
 *
 * @category layers
 */
export const layer = Layer.mergeAll(SqliteStorage.layer, SqliteDirectory.layer);
