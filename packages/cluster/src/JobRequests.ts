/**
 * How a job handles the requests Cluster delivers it, whatever its kind: a request that fails is
 * tried again where it is, after a delay that grows, until it holds or has failed `maxFailures`
 * times; then it is dropped, its work left for the next request to find. A request whose workspace
 * was never created is dropped at once. Failures are logged. `TurnJob` and `DeliveryJob` handle
 * each of their requests through `retrying` and `drop`.
 *
 * @since 0.1.0
 */
import { Effect, Predicate, Schedule } from "effect";

/**
 * A request that fails this many times in a row is not tried again: its job gives up the work it
 * was on, or drops the request.
 *
 * @category utils
 * @since 0.1.0
 */
export const maxFailures = 8;

/**
 * How long a request waits before it is tried again, after each failure: doubling from two
 * seconds, up to five minutes.
 *
 * @category utils
 * @since 0.1.0
 */
export const retryDelays = Schedule.min([
  Schedule.exponential("2 seconds"),
  Schedule.spaced("5 minutes"),
]);

/**
 * Whether a request failed because its workspace was never created, directly or as a run's cause:
 * the gateway's `WorkspaceNotFound`, or a runner's `RunFailed` that carries it.
 *
 * @category utils
 * @since 0.1.0
 */
export const isWorkspaceNotFound = (error: unknown) =>
  Predicate.isTagged(
    Predicate.hasProperty(error, "cause") ? error.cause : error,
    "GatewayErrors.WorkspaceNotFound",
  );

/**
 * Do `work` for a request of `job`, trying again after each failure, `times` more at most, as
 * long as its workspace exists. `named` is what a log says of the request. A failure that would
 * have been a defect is one to try again like any other, rather than one that restarts the entity.
 *
 * @category utils
 * @since 0.1.0
 */
export const retrying = <A, E, R>(
  job: string,
  named: Record<string, unknown>,
  work: Effect.Effect<A, E, R>,
  times?: number,
): Effect.Effect<A, unknown, R> =>
  work.pipe(
    Effect.catchDefect((defect) => Effect.fail(defect)),
    Effect.tapError((error) =>
      Effect.gen(function* () {
        // Each try runs with the schedule's metadata: how many tries came before it.
        const { attempt } = yield* Schedule.CurrentMetadata;
        yield* Effect.logWarning(`${job} request failed`, {
          ...named,
          failures: attempt + 1,
          error,
        });
      }),
    ),
    Effect.retry({
      schedule: retryDelays,
      while: (error) => !isWorkspaceNotFound(error),
      ...(times === undefined ? {} : { times }),
    }),
  );

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
    { ...named, error },
  );
