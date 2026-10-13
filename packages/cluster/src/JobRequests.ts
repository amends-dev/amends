/**
 * What every kind of job does with its requests. A commit that stores one wakes the runners once
 * it is done, through `Wakeup`, so the runner that owns the job reads it at once. A request that
 * fails is tried again where it is, after a delay that grows, until it holds or has failed
 * `maxFailures` times; then it is dropped, its work left for the next request to find. A request
 * whose workspace was never created is dropped at once. Failures are logged. `TurnJob` and
 * `DeliveryJob` store their requests with `Wakeup` and handle each through `retrying` and `drop`.
 *
 * @since 0.1.0
 */

import { Store, type StoreError } from "@amends-dev/core/journal"
import * as Sharding from "effect/cluster/Sharding"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Schedule from "effect/Schedule"

/**
 * Wakes the runners once a commit that stored job requests is done, so the runner that owns each
 * job reads storage then rather than at its next poll: Cluster looks for a request as it stores
 * it, before the commit can show it. `layerWakeLocal` wakes this process's runner alone, enough
 * when it runs every job; a host whose processes share storage provides one that wakes each.
 *
 * @category services
 * @since 0.1.0
 */
export class Wakeup extends Context.Service<
  Wakeup,
  {
    /** Inside a commit that stores a request, wake the runners once the commit is done. */
    readonly afterCommit: Effect.Effect<void, StoreError.StoreError, Store.Transaction>
  }
>()("@amends-dev/cluster/JobRequests/Wakeup") {}

/**
 * Provides `Wakeup` for this process's runner alone, which reads storage again once the commit is
 * done (`Sharding.pollStorage`).
 *
 * @category layers
 * @since 0.1.0
 */
export const layerWakeLocal = Layer.effect(
  Wakeup,
  Effect.map(Sharding.Sharding, (sharding) =>
    Wakeup.of({
      afterCommit: Effect.flatMap(Store.Transaction, (storeTransaction) =>
        storeTransaction.afterCommit(sharding.pollStorage)
      )
    })
  )
)

/**
 * A request that fails this many times in a row is not tried again: its job gives up the work it
 * was on, or drops the request.
 *
 * @category utils
 * @since 0.1.0
 */
export const maxFailures = 8

/**
 * How long a request waits before it is tried again, after each failure: doubling from two
 * seconds, up to five minutes.
 *
 * @category utils
 * @since 0.1.0
 */
export const retryDelays = Schedule.min([Schedule.exponential("2 seconds"), Schedule.spaced("5 minutes")])

/**
 * Whether a request failed because its workspace was never created, directly or as a run's cause:
 * the gateway's `CoreError.NotFound` for the workspace, or a runner's `RunFailed` that carries it.
 *
 * @category utils
 * @since 0.1.0
 */
export const isWorkspaceNotFound = (error: unknown) => {
  const failure = Predicate.hasProperty(error, "cause") ? error.cause : error
  return (
    Predicate.isTagged(failure, "CoreError.NotFound") &&
    Predicate.hasProperty(failure, "resource") &&
    failure.resource === "Workspace"
  )
}

/**
 * A request's work died with `defect`, which its job tries again like any failure, rather than
 * restart the entity.
 *
 * @category errors
 * @since 0.1.0
 */
export class Died extends Data.TaggedError("JobRequests.Died")<{
  readonly defect: unknown
}> {}

/**
 * Do `work` for a request of `job`, trying again after each failure, `times` more at most, as
 * long as its workspace exists. `named` is what a log says of the request. Work that dies fails
 * with `Died`, to be tried again like any other failure.
 *
 * @category utils
 * @since 0.1.0
 */
export const retrying = <A, E, R>(
  job: string,
  named: Record<string, unknown>,
  work: Effect.Effect<A, E, R>,
  times?: number
): Effect.Effect<A, E | Died, R> =>
  work.pipe(
    Effect.catchDefect((defect) => Effect.fail(new Died({ defect }))),
    Effect.tapError((error) =>
      Effect.gen(function* () {
        // Each try runs with the schedule's metadata: how many tries came before it.
        const { attempt } = yield* Schedule.CurrentMetadata
        yield* Effect.logWarning(`${job} request failed`, {
          ...named,
          failures: attempt + 1,
          error
        })
      })
    ),
    Effect.retry({
      schedule: retryDelays,
      while: (error) => !isWorkspaceNotFound(error),
      ...(times === undefined ? {} : { times })
    })
  )

/**
 * Leave the request's work for the next request to find, as it failed with `error` for good,
 * logging why: its workspace was not found, or it kept failing.
 *
 * @category utils
 * @since 0.1.0
 */
export const drop = (job: string, named: Record<string, unknown>, error: unknown) =>
  Effect.logError(
    isWorkspaceNotFound(error)
      ? `${job} request dropped: its workspace was not found`
      : `${job} request dropped: it kept failing`,
    { ...named, error }
  )
