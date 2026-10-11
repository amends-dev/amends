/**
 * Ephemeral signals: typing, turn drafts, and read-state changes for connected readers, never
 * stored. `Signal` is what is sent and whom it reaches; `SignalHub` is how a workspace's signals
 * reach its subscribers across the processes sharing its storage.
 *
 * @since 0.1.0
 */

/**
 * Every workspace's signals within one process, the hub storage adapters bind each workspace to.
 *
 * @since 0.1.0
 */
export * as LocalSignalHub from "./LocalSignalHub.ts";

/**
 * The kinds of signal, and who on the change feed may receive each.
 *
 * @since 0.1.0
 */
export * as Signal from "./Signal.ts";

/**
 * The service that carries one workspace's signals to its subscribers, in process memory too.
 *
 * @since 0.1.0
 */
export * as SignalHub from "./SignalHub.ts";
