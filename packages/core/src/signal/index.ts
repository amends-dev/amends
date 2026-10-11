/**
 * Ephemeral signals: typing, turn drafts, and read-state changes for connected readers, never
 * stored. `Signal` is what is sent and whom it reaches; `SignalHub` is how a workspace's signals
 * reach its subscribers across the processes sharing its storage; and `LocalSignalHub` is one
 * process's hub, which storage binds each workspace's `SignalHub` to.
 *
 * @since 0.1.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as LocalSignalHub from "./LocalSignalHub.ts";

/**
 * @since 0.1.0
 */
export * as Signal from "./Signal.ts";

/**
 * @since 0.1.0
 */
export * as SignalHub from "./SignalHub.ts";
