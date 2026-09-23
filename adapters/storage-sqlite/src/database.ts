import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
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
 * Construct the database service over the caller's SQL client, enforcing foreign keys and
 * applying pending migrations.
 *
 * @category constructors
 */
export const make = Effect.fn("SqliteDatabase.make")(function* () {
  const sql = yield* SqlClient.SqlClient;
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
