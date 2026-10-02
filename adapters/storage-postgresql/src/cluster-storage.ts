/**
 * Upkeep of the tables Effect Cluster's SQL message storage keeps in this database, with its
 * default `cluster` prefix. Cluster never removes a message or its reply, so the host prunes
 * the ones it has handled.
 */
import { AgentJob } from "@amends/cluster";
import { Clock, DateTime, Effect, Option, Schema } from "effect";
import { Snowflake } from "effect/unstable/cluster";
import { SqlClient } from "effect/unstable/sql";
import { PostgresDatabase } from "./database.ts";

/** Another live process runs jobs at this runner address. */
export class AddressTaken extends Schema.TaggedError<AddressTaken>()(
  "PostgresClusterStorage.AddressTaken",
  { address: Schema.String },
) {
  override get message() {
    return `Another process is running jobs at ${this.address}; give each process its own runner address`;
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

/** One kind of agent job request, such as `AcceptWork`, across every workspace. */
export interface RequestStatus {
  readonly request: string;
  /** Requests due now that no runner has handled yet. */
  readonly due: number;
  /** Requests set for later: a retry after a failed run. */
  readonly scheduled: number;
  /** Of the requests not yet handled, those that follow a failed run. */
  readonly retrying: number;
  /** When the longest-waiting due request became due. */
  readonly oldestDue: Option.Option<DateTime.Utc>;
}
/** A request waiting to run again after failed runs. */
export interface Retry {
  readonly request: string;
  readonly workspaceId: string;
  readonly memberId: string;
  readonly attempt: number;
  readonly at: DateTime.Utc;
}
export interface Status {
  readonly requests: ReadonlyArray<RequestStatus>;
  /** The most recent retries, newest first. */
  readonly retries: ReadonlyArray<Retry>;
}

const RequestFields = Schema.Struct({
  workspaceId: Schema.String,
  memberId: Schema.String,
  attempt: Schema.Int,
  at: Schema.Finite,
});
const fromJson = <S extends Schema.Top>(schema: S) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema));

/**
 * What agent jobs wait for and retry, from the requests Cluster keeps: per kind of request, and the
 * latest `limit` (twenty by default) retries. Empty before any host has run agent jobs over this
 * database. It only reads, over any client of the database, such as
 * `PostgresDatabase.layerClient`, which leaves the schema as it is.
 */
export const agentJobStatus = Effect.fn("PostgresClusterStorage.agentJobStatus")(function* (
  options: { readonly limit?: number | undefined } = {},
) {
  const sql = yield* SqlClient.SqlClient;
  const limit = options.limit ?? 20;
  const [tables] = yield* sql<{ readonly present: boolean }>`
    SELECT to_regclass('cluster_messages') IS NOT NULL AS present`;
  if (tables?.present !== true) return { requests: [], retries: [] } satisfies Status;
  const entityType = AgentJob.entity.type;
  const now = yield* Clock.currentTimeMillis;
  const waiting = yield* sql<{
    readonly request: string;
    readonly due: number;
    readonly scheduled: number;
    readonly retrying: number;
    readonly oldest: string | null;
  }>`
    SELECT tag AS request,
      count(*) FILTER (WHERE deliver_at IS NULL OR deliver_at <= ${now})::int AS due,
      count(*) FILTER (WHERE deliver_at > ${now})::int AS scheduled,
      count(*) FILTER (WHERE (payload::jsonb->>'attempt')::int > 0)::int AS retrying,
      min(coalesce(deliver_at, 0)) FILTER (WHERE deliver_at IS NULL OR deliver_at <= ${now})::text
        AS oldest
    FROM cluster_messages
    WHERE entity_type = ${entityType} AND kind = 0 AND NOT processed
    GROUP BY 1
    ORDER BY 1`;
  const retried = yield* sql<{ readonly request: string; readonly payload: string }>`
    SELECT tag AS request, payload FROM cluster_messages
    WHERE entity_type = ${entityType} AND kind = 0 AND NOT processed
      AND (payload::jsonb->>'attempt')::int > 0
    ORDER BY id DESC LIMIT ${limit}`;
  const retries = yield* Effect.forEach(retried, (row) =>
    Effect.map(fromJson(RequestFields)(row.payload), (fields) => ({
      request: row.request,
      workspaceId: fields.workspaceId,
      memberId: fields.memberId,
      attempt: fields.attempt,
      at: DateTime.makeUnsafe(fields.at),
    })),
  );
  return {
    requests: waiting.map((row) => ({
      request: row.request,
      due: row.due,
      scheduled: row.scheduled,
      retrying: row.retrying,
      oldestDue: Option.map(Option.fromNullOr(row.oldest), (millis) =>
        DateTime.makeUnsafe(Number(millis)),
      ),
    })),
    retries,
  } satisfies Status;
});

export * as PostgresClusterStorage from "./cluster-storage.ts";
