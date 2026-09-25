/**
 * Upkeep of the tables Effect Cluster's SQL message storage keeps in this database, with its
 * default `cluster` prefix. Cluster never removes a message or its reply, so the host prunes
 * the ones it has handled.
 */
import { DateTime, Effect, Schema } from "effect";
import { Snowflake } from "effect/unstable/cluster";
import { PostgresDatabase } from "./database.ts";

/** Another live process runs background work at this runner address. */
export class AddressTaken extends Schema.TaggedError<AddressTaken>()(
  "PostgresClusterStorage.AddressTaken",
  { address: Schema.String },
) {
  override get message() {
    return `Another process is running background work at ${this.address}; give each process its own runner address`;
  }
}

/**
 * Remove the handled messages of these entity types stored before `before`, with the replies
 * kept for them, and return how many messages went. A message's ID carries when it was stored.
 * Messages not yet handled stay, however old, as do other entity types' messages. Each statement
 * removes at most `batch` messages (a thousand by default), so each stays short.
 */
export const prune = Effect.fn("PostgresClusterStorage.prune")(function* (
  entityTypes: ReadonlyArray<string>,
  before: DateTime.Utc,
  options: { readonly batch?: number | undefined } = {},
) {
  const batch = options.batch ?? 1000;
  const { sql } = yield* PostgresDatabase.Service;
  const since = DateTime.toEpochMillis(before) - Snowflake.constEpochMillis;
  if (since <= 0 || entityTypes.length === 0) return 0;
  const bound = String(BigInt(since) << 22n);
  let removed = 0;
  while (true) {
    const rows = yield* sql<{ readonly id: string }>`
      WITH handled AS (
        SELECT id FROM cluster_messages
        WHERE entity_type IN ${sql.in(entityTypes)} AND processed AND id < ${bound}::bigint
        ORDER BY id LIMIT ${batch}
      ), replies AS (
        DELETE FROM cluster_replies WHERE request_id IN (SELECT id FROM handled)
      )
      DELETE FROM cluster_messages WHERE id IN (SELECT id FROM handled) RETURNING id`;
    removed += rows.length;
    if (rows.length < batch) return removed;
  }
});

/**
 * Hold a runner address for the scope, so no other process over this database runs at it too:
 * two would share Cluster's machine ID, and the first to stop would remove the other's
 * registration. The claim is a session lock on a connection it keeps, released when the scope
 * closes or, if the process dies, when PostgreSQL ends its session, so a restart after a crash
 * can take the address at once.
 */
export const claimAddress = Effect.fn("PostgresClusterStorage.claimAddress")(function* (
  address: string,
) {
  const { sql } = yield* PostgresDatabase.Service;
  const connection = yield* sql.reserve;
  const key = JSON.stringify(["runner", address]);
  const claim = (statement: string) =>
    connection
      .executeUnprepared(statement, [key], undefined)
      .pipe(Effect.map((rows) => (rows[0] as { readonly held?: boolean } | undefined)?.held));
  if ((yield* claim("SELECT pg_try_advisory_lock(hashtextextended($1, 2)) AS held")) !== true)
    return yield* new AddressTaken({ address });
  // A session lock outlives the connection's return to the pool, so let it go first.
  yield* Effect.addFinalizer(() =>
    Effect.ignore(claim("SELECT pg_advisory_unlock(hashtextextended($1, 2)) AS held")),
  );
});

export * as PostgresClusterStorage from "./cluster-storage.ts";
