/**
 * Workspace storage over PostgreSQL, for the local host: core's stores and each workspace's signal
 * hub, the workspace directory, the host's accounts, and sign-in storage, written with Drizzle and
 * run through `@effect/sql-pg`. `PostgresStorage.layer` provides them all over a
 * `PostgresDatabase.layer`, and `PostgresClusterStorage` keeps up Effect Cluster's tables beside
 * them. Each store's driver, over one workspace's binding, stays inside the package.
 *
 * @since 0.1.0
 */

/**
 * The host's accounts, a human ID for each address, in one table beside every workspace's.
 *
 * @since 0.1.0
 */
export * as PostgresAccounts from "./PostgresAccounts.ts";

/**
 * Upkeep of Effect Cluster's tables in this database: pruning handled messages, and holding a
 * runner address.
 *
 * @since 0.1.0
 */
export * as PostgresClusterStorage from "./PostgresClusterStorage.ts";

/**
 * One connected database, with the schema applied, that every other module runs its statements
 * on.
 *
 * @since 0.1.0
 */
export * as PostgresDatabase from "./PostgresDatabase.ts";

/**
 * One identity's workspaces and pending invitations, read across every workspace in the database.
 *
 * @since 0.1.0
 */
export * as PostgresDirectory from "./PostgresDirectory.ts";

/**
 * Sign-in's codes and sessions, kept across every workspace.
 *
 * @since 0.1.0
 */
export * as PostgresSignInStorage from "./PostgresSignInStorage.ts";

/**
 * Every gateway contract the adapter implements, in one layer.
 *
 * @since 0.1.0
 */
export * as PostgresStorage from "./PostgresStorage.ts";

/**
 * Each workspace's stores and signal hub, built on demand over one pool.
 *
 * @since 0.1.0
 */
export * as PostgresWorkspaceStorage from "./PostgresWorkspaceStorage.ts";
