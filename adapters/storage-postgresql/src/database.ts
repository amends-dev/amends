import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { fileURLToPath } from "node:url";
import { PostgresAppends } from "./appends.ts";

/** Migrations generated from the schema by `bun run generate`; applied during construction. */
export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export type DrizzleClient = Effect.Success<ReturnType<typeof PgDrizzle.makeWithDefaults>>;

/**
 * One connected database: the Drizzle instance for typed statements, and the
 * Effect client whose transaction service both share. Every Drizzle statement
 * runs through that client, so a transaction the journal opens on a reserved
 * connection carries the Drizzle statements inside it.
 */
export interface Interface {
  readonly db: DrizzleClient;
  readonly sql: SqlClient.SqlClient;
  /** Wakeups for readers waiting on a log, from one listener for this pool. */
  readonly appends: PostgresAppends.Interface;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/storage-postgresql/database/Service",
) {}

/**
 * Construct the database service over the caller's PostgreSQL client, applying pending
 * migrations. Its append listener holds one of the pool's connections while readers wait.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresDatabase.make")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const db = yield* PgDrizzle.makeWithDefaults();
  yield* migrate(db, { migrationsFolder });
  const appends = yield* PostgresAppends.make();
  return Service.of({ db, sql, appends });
});

/**
 * Connect a pool with the given configuration and bring the schema up to date.
 *
 * @category layers
 */
export const layer = (config: PgClient.PgPoolConfig) =>
  Layer.effect(Service, make()).pipe(Layer.provideMerge(PgClient.layer(config)));

export * as PostgresDatabase from "./database.ts";
