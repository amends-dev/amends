/**
 * A cap on the pooled connections one process's statements for one workspace use at once outside
 * its transactions, so a burst of reads for a busy workspace leaves the rest of the pool to the
 * others. Statements beyond the cap wait for one of the workspace's own to finish. The binding's
 * `guard` runs every statement outside a transaction through it, with the `readConnections` the
 * host set.
 *
 * @since 0.1.0
 */
import { Context, Effect, Option, Semaphore } from "effect";

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

interface Lane {
  readonly semaphore: Semaphore.Semaphore;
  users: number;
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
  // A lane lives while it has statements, so keys never accumulate.
  const lanes = new Map<string, Lane>();
  const run = <A, E, R>(
    key: string,
    permits: number,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    Effect.flatMap(Effect.serviceOption(Holding), (holding) =>
      Option.contains(holding, key)
        ? effect
        : Effect.acquireUseRelease(
            Effect.sync(() => {
              const lane = lanes.get(key) ?? { semaphore: Semaphore.makeUnsafe(permits), users: 0 };
              lane.users += 1;
              lanes.set(key, lane);
              return lane;
            }),
            (lane) => lane.semaphore.withPermits(1)(Effect.provideService(effect, Holding, key)),
            (lane) =>
              Effect.sync(() => {
                lane.users -= 1;
                if (lane.users === 0 && lanes.get(key) === lane) lanes.delete(key);
              }),
          ),
    );
  return { run };
};
