import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Database } from "bun:sqlite";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { Migrations } from "./migrations.ts";

/**
 * One SQLite connection, shared by every workspace view. A transaction whose
 * rollback failed leaves the connection unusable; the flag records that so
 * later transactions refuse rather than run on a connection in an unknown state.
 */
export interface Interface {
  readonly sql: SqlClient.SqlClient;
  readonly health: { broken: boolean };
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/storage-sqlite/database/Service",
) {}

/**
 * Distinct SQL strings each connection keeps prepared. The client prepares every statement
 * through Bun's `Database.query` cache, which holds 20 by default; the stores issue well over
 * that, so a smaller cache compiles most statements again on every execution.
 */
export const preparedStatements = 512;

/**
 * Construct the database service over the caller's SQL client, enforcing foreign keys and
 * applying pending migrations. Raises Bun's process-wide query cache to `preparedStatements`
 * when it is smaller; the limit is read per query, so it covers connections already open.
 *
 * @category constructors
 */
export const make = Effect.fn("SqliteDatabase.make")(function* () {
  const sql = yield* SqlClient.SqlClient;
  Database.MAX_QUERY_CACHE_SIZE = Math.max(Database.MAX_QUERY_CACHE_SIZE, preparedStatements);
  // SQLite ignores declared foreign keys unless each connection enables them outside a transaction.
  yield* sql`PRAGMA foreign_keys = ON`;
  yield* SqliteMigrator.run({ loader: Migrations.loader });
  return Service.of({ sql, health: { broken: false } });
});

/**
 * Open the file, bring its schema up to date, and share the connection. Transactions use BEGIN IMMEDIATE.
 *
 * @category layers
 */
export const layer = (filename: string) =>
  Layer.effect(Service, make()).pipe(
    Layer.provideMerge(SqliteClient.layer({ filename, busyTimeout: 0 })),
  );

export * as SqliteDatabase from "./database.ts";
