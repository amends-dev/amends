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

/**
 * A connection's record, the views readers see of it and of the host's integrations, and the
 * inputs of the operations on it.
 *
 * @since 0.1.0
 */
export * as Connection from "./Connection.ts";

/**
 * The storage contract for connections' credentials, kept outside the journal.
 *
 * @since 0.1.0
 */
export * as ConnectionCredentialStore from "./ConnectionCredentialStore.ts";

/**
 * The outcomes `ConnectionService` reports that a caller can act on.
 *
 * @since 0.1.0
 */
export * as ConnectionErrors from "./ConnectionErrors.ts";

/**
 * The facts recorded about connections.
 *
 * @since 0.1.0
 */
export * as ConnectionFacts from "./ConnectionFacts.ts";

/**
 * The actions on connections that need a grant: creating, reading, managing, and using one.
 *
 * @since 0.1.0
 */
export * as ConnectionPermissions from "./ConnectionPermissions.ts";

/**
 * The projection that keeps the connection read model.
 *
 * @since 0.1.0
 */
export * as ConnectionProjection from "./ConnectionProjection.ts";

/**
 * The operations on connections an actor calls: reading, creating, changing, checking, and removing
 * them.
 *
 * @since 0.1.0
 */
export * as ConnectionService from "./ConnectionService.ts";

/**
 * The storage contract for connections.
 *
 * @since 0.1.0
 */
export * as ConnectionStore from "./ConnectionStore.ts";
