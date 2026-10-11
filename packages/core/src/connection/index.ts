/**
 * Connections: a workspace's links to the integrations its host installs, as
 * `@amends-dev/connection` declares them, each with its settings and how it authenticates.
 * `Connection` is the record and the views readers see; `ConnectionService` the operations an actor
 * calls; `ConnectionFacts` and `ConnectionProjection` how changes are recorded and kept; and
 * `ConnectionStore` and `ConnectionCredentialStore` the contracts every storage adapter implements,
 * the second keeping keys outside the journal.
 *
 * @since 0.1.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as Connection from "./Connection.ts";

/**
 * @since 0.1.0
 */
export * as ConnectionCredentialStore from "./ConnectionCredentialStore.ts";

/**
 * @since 0.1.0
 */
export * as ConnectionErrors from "./ConnectionErrors.ts";

/**
 * @since 0.1.0
 */
export * as ConnectionFacts from "./ConnectionFacts.ts";

/**
 * @since 0.1.0
 */
export * as ConnectionPermissions from "./ConnectionPermissions.ts";

/**
 * @since 0.1.0
 */
export * as ConnectionProjection from "./ConnectionProjection.ts";

/**
 * @since 0.1.0
 */
export * as ConnectionService from "./ConnectionService.ts";

/**
 * @since 0.1.0
 */
export * as ConnectionStore from "./ConnectionStore.ts";
