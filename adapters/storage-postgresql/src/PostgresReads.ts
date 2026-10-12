/**
 * A cap on the pooled connections one process's statements for one workspace use at once outside
 * its transactions, so a burst of reads for a busy workspace leaves the rest of the pool to the
 * others. Statements beyond the cap wait for one of the workspace's own to finish. The binding's
 * `guard` runs every statement outside a transaction through it, with the `readConnections` the
 * host set.
 *
 * @since 0.1.0
 */
import { Context, Effect, Option } from "effect";
import * as Lanes from "./internal/lanes.ts";

/**
 * The read cap of one pool, keyed by workspace.
 *
 * @category models
 * @since 0.1.0
 */
export interface PostgresReads {
  /** Run the effect as one of at most `permits` at once for this key in this process. */
  readonly run: <A, E, R>(
    key: string,
    permits: number,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

/** Marks a fiber already holding a place for a key, so statements inside it do not wait again. */
class Holding extends Context.Service<Holding, string>()(
  "@amends-dev/storage-postgresql/PostgresReads/Holding",
) {}

/**
 * A read cap with no statements waiting; `PostgresDatabase.make` makes one for each pool.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (): PostgresReads => {
  const lanes = Lanes.make();
  const run = <A, E, R>(
    key: string,
    permits: number,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    Effect.flatMap(Effect.serviceOption(Holding), (holding) =>
      Option.contains(holding, key)
        ? effect
        : lanes(key, permits, (semaphore) =>
            semaphore.withPermits(1)(Effect.provideService(effect, Holding, key)),
          ),
    );
  return { run };
};
