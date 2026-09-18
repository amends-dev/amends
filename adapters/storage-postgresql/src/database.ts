import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { fileURLToPath } from "node:url";

/** Migrations generated from the schema by `bun run generate`; applied when the layer is built. */
export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export type Client = Effect.Success<ReturnType<typeof PgDrizzle.makeWithDefaults>>;

/**
 * One connected database: the Drizzle instance for typed statements, and the
 * Effect client whose transaction service both share. Every Drizzle statement
 * runs through that client, so a transaction the journal opens on a reserved
 * connection carries the Drizzle statements inside it.
 */
export interface Database {
  readonly db: Client;
  readonly sql: SqlClient.SqlClient;
}

export class Service extends Context.Service<Service, Database>()(
  "@amends/storage-postgresql/database/Service",
) {}

export const make = Effect.fn("PostgresDatabase.make")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const db = yield* PgDrizzle.makeWithDefaults();
  yield* migrate(db, { migrationsFolder });
  return Service.of({ db, sql });
});

/** Connect a pool with the given configuration and bring the schema up to date. */
export const layer = (config: PgClient.PgPoolConfig) =>
  Layer.effect(Service, make()).pipe(Layer.provideMerge(PgClient.layer(config)));

export * as PostgresDatabase from "./database.ts";
