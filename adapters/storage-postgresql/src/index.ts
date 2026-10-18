/**
 * Workspace storage over PostgreSQL, for the local host: core's stores, the workspace directory,
 * the host's accounts, and sign-in storage, written with Drizzle and
 * run through `@effect/sql-pg`. `PostgresStorage.layer` provides them all over a
 * `PostgresDatabase.layer`, and `PostgresClusterStorage` keeps up Effect Cluster's tables beside
 * them. `PostgresDatabase` holds the pool's `PostgresNotices`, `PostgresTurns`, and
 * `PostgresReads`. Each store's
 * driver, over one workspace's binding, stays inside the package.
 *
 * @since 0.1.0
 */

// @barrel(Postgres*.ts): Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as PostgresAccounts from "./PostgresAccounts.ts"

/**
 * @since 0.1.0
 */
export * as PostgresClusterStorage from "./PostgresClusterStorage.ts"

/**
 * @since 0.1.0
 */
export * as PostgresDatabase from "./PostgresDatabase.ts"

/**
 * @since 0.1.0
 */
export * as PostgresDirectory from "./PostgresDirectory.ts"

/**
 * @since 0.1.0
 */
export * as PostgresNotices from "./PostgresNotices.ts"

/**
 * @since 0.1.0
 */
export * as PostgresReads from "./PostgresReads.ts"

/**
 * @since 0.1.0
 */
export * as PostgresSignInStorage from "./PostgresSignInStorage.ts"

/**
 * @since 0.1.0
 */
export * as PostgresStorage from "./PostgresStorage.ts"

/**
 * @since 0.1.0
 */
export * as PostgresSyncStorage from "./PostgresSyncStorage.ts"

/**
 * @since 0.1.0
 */
export * as PostgresTurns from "./PostgresTurns.ts"

/**
 * @since 0.1.0
 */
export * as PostgresWorkspaceStorage from "./PostgresWorkspaceStorage.ts"
