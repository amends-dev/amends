/**
 * Read state: how far each person has read threads and groups, private to them and kept outside
 * the journal. `ReadState` is the records; `ReadStateService` the operations an actor calls;
 * `ReadStateCommand` the write thread and message operations share; and `ReadStateStore` the
 * contract every storage adapter implements.
 *
 * @since 0.1.0
 */

/**
 * A person's read position in a thread and read time in a group, and the inputs that advance them.
 *
 * @since 0.1.0
 */
export * as ReadState from "./ReadState.ts";

/**
 * The operations on read state an actor calls: marking a thread or a group read.
 *
 * @since 0.1.0
 */
export * as ReadStateService from "./ReadStateService.ts";

/**
 * The storage contract for read state.
 *
 * @since 0.1.0
 */
export * as ReadStateStore from "./ReadStateStore.ts";

/**
 * The write to read state that operations share, joining the caller's transaction when there is
 * one.
 *
 * @since 0.1.0
 */
export * as ReadStateCommand from "./ReadStateCommand.ts";
