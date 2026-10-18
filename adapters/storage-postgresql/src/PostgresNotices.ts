/**
 * Notices between pools over one channel: commits that append to a log, so waiting readers look
 * again, and commits that store job requests, so runners read them. A commit notifies right after COMMIT succeeds, on its own
 * connection, rather than inside its transaction, where the notification lock would serialize
 * every notifying commit on the server; a notice lost between the two leaves readers to their
 * poll. One listener per pool, on one connection, routes them all. `PostgresDatabase` makes one
 * for each pool; `Journal`, the log store, waits on its append notices, and
 * `PostgresClusterStorage` on its job request notices.
 *
 * @since 0.1.0
 */

import type { WorkspaceId } from "@amends-dev/core/workspace"
import * as PgClient from "@effect/sql-pg/PgClient"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as RcRef from "effect/RcRef"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"

/**
 * The channel every notice uses.
 *
 * @category constants
 * @since 0.1.0
 */
export const channel = "amends_notices"

/**
 * A notice on the channel, as a JSON array: an append to a log in a workspace, or a commit that
 * stored job requests. A notice is its own key: it wakes whoever waits on the same text.
 */
const Notice = Schema.fromJsonString(
  Schema.Union([
    Schema.Tuple([Schema.Literal("append"), Schema.String, Schema.String]),
    Schema.Tuple([Schema.Literal("job-requests")])
  ])
)
const encodeNotice = Schema.encodeSync(Notice)

/**
 * The notice an append sends for each log it appended to, by its id.
 *
 * @category constructors
 * @since 0.1.0
 */
export const appendNotice = (workspaceId: WorkspaceId.WorkspaceId, logId: string): string =>
  encodeNotice(["append", workspaceId, logId])

/**
 * The notice a commit that stored job requests sends, so the runner that owns each job, in
 * whichever process, reads it at once.
 *
 * @category constants
 * @since 0.1.0
 */
export const jobRequestsNotice = encodeNotice(["job-requests"])

/**
 * One pool's notices: waiting for appends and job requests, and telling other pools of appends.
 *
 * @category models
 * @since 0.1.0
 */
export interface PostgresNotices {
  /**
   * Keep this pool listening for the caller's scope. The first lease waits for PostgreSQL to
   * confirm `LISTEN`, briefly, so an append right after the caller's first check still wakes
   * it; the listener stops a while after the last lease closes.
   */
  readonly listening: Effect.Effect<void, never, Scope.Scope>
  /**
   * Completes at this log's next append. It also completes whenever the listener connects, since
   * notices sent while it was not listening are lost. Take it before checking the log, so an
   * append between the check and the wait still wakes the caller. Hold a `listening` lease while
   * waiting.
   */
  readonly nextAppend: (workspaceId: WorkspaceId.WorkspaceId, logId: string) => Deferred.Deferred<void>
  /**
   * Completes at the next commit, in any pool, that stores job requests. It also completes
   * whenever the listener connects, since notices sent while it was not listening are lost. Take
   * it before reading storage, so a commit between the read and the wait still wakes the caller.
   * Hold a `listening` lease while waiting.
   */
  readonly nextJobRequests: () => Deferred.Deferred<void>
  /**
   * Tell waiting readers in every pool that an append outside any transaction landed, best effort:
   * a notice lost leaves them to their poll.
   */
  readonly notifyAppend: (workspaceId: WorkspaceId.WorkspaceId, logId: string) => Effect.Effect<void>
}

/**
 * How the listener recovers when its connection fails.
 *
 * @category options
 * @since 0.1.0
 */
export interface Options {
  /** How long to wait before listening again after the listener's connection fails. */
  readonly retry?: Duration.Input | undefined
}

/**
 * Construct the notice router and its listener over the pool's client. The listener starts with
 * the first `listening` lease and stops 30 seconds after the last.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fnUntraced(function* (options: Options = {}) {
  const client = yield* PgClient.PgClient
  const retry = Duration.fromInputUnsafe(options.retry ?? "1 second")
  const waiting = new Map<string, Deferred.Deferred<void>>()
  const wake = (key: string) => {
    const appended = waiting.get(key)
    if (appended === undefined) return
    waiting.delete(key)
    Deferred.doneUnsafe(appended, Effect.void)
  }
  const wakeAll = () => {
    for (const key of waiting.keys()) wake(key)
  }

  const listen = (ready: Deferred.Deferred<void>) =>
    Effect.gen(function* () {
      const notices = yield* client.listen(channel)
      // Appends made while not listening sent notices nobody received.
      wakeAll()
      yield* Deferred.succeed(ready, undefined)
      // A notice nobody waits on, such as one this version does not know, wakes nobody.
      while (true) wake((yield* Queue.take(notices)).payload)
    }).pipe(
      Effect.scoped,
      Effect.exit,
      // Waiters keep waiting: listening again wakes them to re-check what they missed meanwhile.
      Effect.tap((exit) =>
        Effect.andThen(
          Deferred.succeed(ready, undefined),
          Effect.logWarning("Notice listener stopped; listening again", exit)
        )
      ),
      Effect.andThen(Effect.sleep(retry)),
      Effect.forever
    )

  const listener = yield* RcRef.make({
    acquire: Effect.gen(function* () {
      const ready = yield* Deferred.make<void>()
      yield* Effect.forkScoped(listen(ready))
      yield* Deferred.await(ready).pipe(Effect.timeout("5 seconds"), Effect.ignore)
    }),
    idleTimeToLive: "30 seconds"
  })
  const listening = RcRef.get(listener)

  /** The waiter woken at the next notice `key`. */
  const next = (key: string) => {
    const existing = waiting.get(key)
    if (existing !== undefined) return existing
    const noticed = Deferred.makeUnsafe<void>()
    waiting.set(key, noticed)
    return noticed
  }
  const nextAppend = (workspaceId: WorkspaceId.WorkspaceId, logId: string) => next(appendNotice(workspaceId, logId))
  const nextJobRequests = () => next(jobRequestsNotice)

  const notifyAppend = (workspaceId: WorkspaceId.WorkspaceId, logId: string) =>
    client
      .notify(channel, appendNotice(workspaceId, logId))
      .pipe(Effect.catchCause((cause) => Effect.logWarning("Append notice not sent", cause)))

  return {
    listening,
    nextAppend,
    nextJobRequests,
    notifyAppend
  } satisfies PostgresNotices
})
