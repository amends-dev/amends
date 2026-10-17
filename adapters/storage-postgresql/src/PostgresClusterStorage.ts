/**
 * Effect Cluster over this database: the tables its SQL message storage keeps here, with its
 * default `cluster` prefix, and how the processes over the database hear of the job requests
 * commits store there. Cluster never removes a message or its reply, so the host prunes the ones
 * it has handled with `prune`, and holds its runner address with `claimAddress` so that no two
 * processes over the database run Cluster at one address. `layerOneAtATime` starts Cluster one
 * process at a time, as it creates its tables. `layerWakeup` wakes the runners once a
 * commit that stored job requests is done, and `layerWakeupListener` keeps a process that runs jobs
 * awake to them, so a job's request is read at once whichever process committed it.
 *
 * @since 0.1.0
 */

import { JobRequests } from "@amends-dev/cluster"
import { StoreError } from "@amends-dev/log"
import * as Sharding from "effect/cluster/Sharding"
import * as Snowflake from "effect/cluster/Snowflake"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Binding from "./internal/binding.ts"
import * as PostgresDatabase from "./PostgresDatabase.ts"
import * as PostgresNotices from "./PostgresNotices.ts"

/**
 * Another live process runs jobs at this runner address.
 *
 * @category errors
 * @since 0.1.0
 */
export class AddressTaken extends Schema.TaggedError<AddressTaken>()("PostgresClusterStorage.AddressTaken", {
  address: Schema.String
}) {
  override get message() {
    return `Another process is running jobs at ${this.address}; give each process its own runner address`
  }
}

/**
 * Remove the handled messages of these entity types stored before `before`, with the replies
 * kept for them, and return how many messages went. A message's ID carries when it was stored.
 * Messages not yet handled stay, however old, as do other entity types' messages. Each statement
 * removes at most `batch` messages (a thousand by default), so each stays short.
 *
 * @category utilities
 * @since 0.1.0
 */
export const prune = Effect.fn("PostgresClusterStorage.prune")(function* (
  entityTypes: ReadonlyArray<string>,
  before: DateTime.Utc,
  options: { readonly batch?: number | undefined } = {}
) {
  const batch = options.batch ?? 1000
  const { sql } = yield* PostgresDatabase.PostgresDatabase
  const since = DateTime.toEpochMillis(before) - Snowflake.constEpochMillis
  if (since <= 0 || entityTypes.length === 0) return 0
  const bound = String(BigInt(since) << 22n)
  let removed = 0
  while (true) {
    const rows = yield* sql<{ readonly id: string }>`
      WITH handled AS (
        SELECT id FROM cluster_messages
        WHERE entity_type IN ${sql.in(entityTypes)} AND processed AND id < ${bound}::bigint
        ORDER BY id LIMIT ${batch}
      ), replies AS (
        DELETE FROM cluster_replies WHERE request_id IN (SELECT id FROM handled)
      )
      DELETE FROM cluster_messages WHERE id IN (SELECT id FROM handled) RETURNING id`
    removed += rows.length
    if (rows.length < batch) return removed
  }
})

/**
 * Hold a runner address for the scope, so no other process over this database runs at it too:
 * two would share Cluster's machine ID, and the first to stop would remove the other's
 * registration. The claim is a session lock on a connection it keeps, released when the scope
 * closes or, if the process dies, when PostgreSQL ends its session, so a restart after a crash
 * can take the address at once. Fails with `AddressTaken` while another process holds it.
 *
 * @category resource management
 * @since 0.1.0
 */
export const claimAddress = Effect.fn("PostgresClusterStorage.claimAddress")(function* (address: string) {
  const { sql } = yield* PostgresDatabase.PostgresDatabase
  const connection = yield* sql.reserve
  const key = JSON.stringify(["runner", address])
  const claim = (statement: string) =>
    connection
      .executeUnprepared(statement, [key], undefined)
      .pipe(Effect.map((rows) => (rows[0] as { readonly held?: boolean } | undefined)?.held))
  if ((yield* claim("SELECT pg_try_advisory_lock(hashtextextended($1, 2)) AS held")) !== true)
    return yield* new AddressTaken({ address })
  // A session lock outlives the connection's return to the pool, so let it go first.
  yield* Effect.addFinalizer(() => Effect.ignore(claim("SELECT pg_advisory_unlock(hashtextextended($1, 2)) AS held")))
})

/**
 * Build `cluster`, Effect Cluster's layer over this database, one process at a time: Cluster
 * creates its tables as it starts, and processes starting together over a new database would race
 * to create them, failing all but one. The first to take the lock creates them; the others wait
 * for it, then find them there. The lock holds one of the pool's connections while `cluster` is
 * built.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerOneAtATime = <A, E, R>(cluster: Layer.Layer<A, E, R>) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const clusterScope = yield* Effect.scope
      const { sql } = yield* PostgresDatabase.PostgresDatabase
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const connection = yield* sql.reserve
          const key = JSON.stringify(["cluster", "start"])
          const lock = (statement: string) => connection.executeUnprepared(statement, [key], undefined)
          yield* lock("SELECT pg_advisory_lock(hashtextextended($1, 2))")
          // A session lock outlives the connection's return to the pool, so let it go first.
          yield* Effect.addFinalizer(() => Effect.ignore(lock("SELECT pg_advisory_unlock(hashtextextended($1, 2))")))
          return yield* Layer.buildWithScope(cluster, clusterScope)
        })
      )
    })
  )

/**
 * Provides cluster's `JobRequests.Wakeup` over this database's transactions: once a commit that
 * stored job requests is done, this process's runner reads storage again, and the commit's
 * notices, sent right after COMMIT, wake every other process's listener. A notice lost leaves those
 * runners to their next poll.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerWakeup = Layer.effect(
  JobRequests.Wakeup,
  Effect.gen(function* () {
    const sharding = yield* Sharding.Sharding
    return JobRequests.Wakeup.of({
      afterCommit: Effect.gen(function* () {
        const session = yield* Effect.serviceOption(Binding.CurrentTransaction)
        if (Option.isNone(session) || !session.value.active)
          return yield* StoreError.failed("Store", "wake runners")("Missing or closed workspace transaction")
        // Sent with the commit's other notices, once it commits; repeats within it are sent once.
        session.value.notices.add(PostgresNotices.jobRequestsNotice)
        yield* Binding.afterCommit(session.value, sharding.pollStorage)
      })
    })
  })
)

/**
 * Keep this process's runner reading storage whenever a commit in any process over the database
 * stores job requests, and whenever the pool's listener connects, for as long as the layer lives.
 * It keeps the pool listening meanwhile, holding one of its connections. Only a process that runs
 * jobs needs it.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerWakeupListener = Layer.effectDiscard(
  Effect.gen(function* () {
    const sharding = yield* Sharding.Sharding
    const { notices } = yield* PostgresDatabase.PostgresDatabase
    yield* notices.listening
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.gen(function* () {
          // Taken before the read, so a commit during it wakes the runner again.
          const next = notices.nextJobRequests()
          yield* sharding.pollStorage
          yield* Deferred.await(next)
        })
      )
    )
  })
)
