import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Context, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { fileURLToPath } from "node:url";
import { PostgresNotices } from "./notices.ts";
import { PostgresReads } from "./reads.ts";
import { PostgresTurns } from "./turns.ts";

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
  /** Append wakeups and relayed signals, from one listener for this pool. */
  readonly notices: PostgresNotices.Interface;
  /** Turns among this process's writers to one workspace or log, before they take a connection. */
  readonly turns: PostgresTurns.Interface;
  /** The cap on connections one workspace's statements outside its transactions use at once. */
  readonly reads: PostgresReads.Interface;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/storage-postgresql/database/Service",
) {}

/**
 * Construct the database service over the caller's PostgreSQL client, applying pending
 * migrations one process at a time. Its notice listener holds one of the pool's connections while readers wait.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresDatabase.make")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const db = yield* PgDrizzle.makeWithDefaults();
  // Processes starting together would otherwise race to create the schema. The first to take
  // the lock migrates; the others wait for its commit and then find nothing left to apply.
  yield* sql.withTransaction(
    Effect.andThen(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('amends:migrate', 0))`,
      migrate(db, { migrationsFolder }),
    ),
  );
  const notices = yield* PostgresNotices.make();
  return Service.of({
    db,
    sql,
    notices,
    turns: PostgresTurns.make(),
    reads: PostgresReads.make(),
  });
});

/**
 * Connect a pool with the given configuration and bring the schema up to date.
 *
 * @category layers
 */
export const layer = (config: PgClient.PgPoolConfig) =>
  Layer.effect(Service, make()).pipe(Layer.provideMerge(PgClient.layer(config)));

/**
 * Connect a pool without bringing the schema up to date, for tools that only read, such as the
 * background status, and must not change a database a newer or older host serves.
 *
 * @category layers
 */
export const layerClient = (
  config: PgClient.PgPoolConfig,
): Layer.Layer<SqlClient.SqlClient, SqlError.SqlError> => PgClient.layer(config);

export * as PostgresDatabase from "./database.ts";
