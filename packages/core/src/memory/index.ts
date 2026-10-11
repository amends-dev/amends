/**
 * Memory storage: every store contract, and the signal hub, implemented in process memory. It is
 * the reference implementation of the storage contracts, which core's tests and the gateway's
 * memory storage run over; nothing survives the process. A host provides one `MemoryDatabase`,
 * connects to it through `MemoryConnection`, and builds `MemoryStores.layer` for each workspace it
 * opens. `Rows` is how records are kept, for the gateway's own memory stores too.
 *
 * @since 0.1.0
 */

/**
 * One host's connection to memory storage, whose transactions take turns on one gate.
 *
 * @since 0.1.0
 */
export * as MemoryConnection from "./MemoryConnection.ts";

/**
 * The storage every connected host shares: each workspace's state, the session logs, and the
 * tables and locks beside them.
 *
 * @since 0.1.0
 */
export * as MemoryDatabase from "./MemoryDatabase.ts";

/**
 * Every store core requires, and the signal hub, bound to one workspace.
 *
 * @since 0.1.0
 */
export * as MemoryStores from "./MemoryStores.ts";

/**
 * How records are kept as JSON by ID, and the binary order lists follow.
 *
 * @since 0.1.0
 */
export * as Rows from "./Rows.ts";
