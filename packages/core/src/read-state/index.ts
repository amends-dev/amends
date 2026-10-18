/**
 * Read state: how far each person has read threads and groups, private to them and kept outside
 * the journal. `ReadState` is the records; `ReadStateService` the operations an actor calls; and
 * `ReadStateStore` the contract every storage adapter implements, which thread and message
 * operations also write to mark a thread read for its author.
 *
 * @since 0.1.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as ReadState from "./ReadState.ts"

/**
 * @since 0.1.0
 */
export * as ReadStateService from "./ReadStateService.ts"

/**
 * @since 0.1.0
 */
export * as ReadStateStore from "./ReadStateStore.ts"
