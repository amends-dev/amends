/**
 * Upkeep of the tables Effect Cluster's SQL message storage keeps in this database, with its
 * default `cluster` prefix. Cluster never removes a message or its reply, so the host prunes
 * the ones it has handled.
 */
import { DateTime, Effect } from "effect";
import { Snowflake } from "effect/unstable/cluster";
import { PostgresDatabase } from "./database.ts";

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

export * as PostgresClusterStorage from "./cluster-storage.ts";
