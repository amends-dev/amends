/**
 * Typed, append-only logs over host storage: the contract a storage adapter implements, `Store`,
 * and the logs written through it, `Log`, with commits that span logs, idempotent appends, entries
 * selected by name or subject, paged reads, and live tails. `MemoryStore` keeps logs in process
 * memory, and `@amends-dev/log/conformance` holds the suites every adapter runs.
 *
 * @since 0.2.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.2.0
 */
export * as Codec from "./Codec.ts"

/**
 * @since 0.2.0
 */
export * as Commit from "./Commit.ts"

/**
 * @since 0.2.0
 */
export * as Entry from "./Entry.ts"

/**
 * @since 0.2.0
 */
export * as Log from "./Log.ts"

/**
 * @since 0.2.0
 */
export * as MemoryStore from "./MemoryStore.ts"

/**
 * @since 0.2.0
 */
export * as Store from "./Store.ts"

/**
 * @since 0.2.0
 */
export * as StoreError from "./StoreError.ts"

/**
 * @since 0.2.0
 */
export * as StoreInput from "./StoreInput.ts"

/**
 * @since 0.2.0
 */
export * as Transaction from "./Transaction.ts"
