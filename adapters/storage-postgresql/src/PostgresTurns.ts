/**
 * Turns among one process's writers to the same workspace, or to the same log for standalone
 * appends. They wait for each other here, in memory, so a queue of writers to one workspace holds
 * one pooled connection while PostgreSQL makes it wait for the lock, rather than one each. The
 * binding's transactions take their turns here, within the host's `lockTimeout`.
 *
 * @since 0.1.0
 */
import { Effect } from "effect";
import type { Duration } from "effect";
import * as Lanes from "./internal/lanes.ts";

/**
 * The writer queue of one pool, keyed by workspace, or by workspace and log.
 *
 * @category models
 * @since 0.1.0
 */
export interface PostgresTurns {
  /**
   * Run the effect in its turn among this process's writers with the same key, failing with
   * `onTimeout` instead when its turn does not start within `patience`. Once started, it runs to
   * its end: the patience bounds only the wait.
   */
  readonly run: <A, E, R, E2>(
    key: string,
    patience: Duration.Duration,
    onTimeout: () => E2,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | E2, R>;
}

/**
 * A writer queue with no writers waiting; `PostgresDatabase.make` makes one for each pool.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (): PostgresTurns => {
  const lanes = Lanes.make();
  const run = <A, E, R, E2>(
    key: string,
    patience: Duration.Duration,
    onTimeout: () => E2,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | E2, R> =>
    lanes(key, 1, (semaphore) =>
      Effect.suspend(() => {
        // Whichever of the turn and the deadline comes first decides, and both check and set
        // this synchronously, so a turn that starts is never timed out, and one granted after
        // the deadline gives its permit straight back.
        let state: "waiting" | "started" | "expired" = "waiting";
        const turn = semaphore.withPermits(1)(
          Effect.suspend((): Effect.Effect<A, E | E2, R> => {
            if (state === "expired") return Effect.fail(onTimeout());
            state = "started";
            return effect;
          }),
        );
        const deadline = Effect.sleep(patience).pipe(
          Effect.andThen(
            Effect.suspend((): Effect.Effect<never, E2> => {
              if (state !== "waiting") return Effect.never;
              state = "expired";
              return Effect.fail(onTimeout());
            }),
          ),
        );
        return Effect.raceFirst(turn, deadline);
      }),
    );

  return { run };
};
