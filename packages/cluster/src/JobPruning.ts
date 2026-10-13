/**
 * Pruning of the requests Effect Cluster handled. Cluster never removes a message or its reply,
 * so a job on one runner of the cluster removes the handled ones once they are old enough. The host
 * gives `layer` the entity types to prune, such as `TurnJob.entity.type`, and `prune`, since only
 * its storage knows how.
 *
 * @since 0.1.0
 */
import * as Cron from "effect/Cron";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as ClusterCron from "effect/cluster/ClusterCron";

/**
 * The name of the job that prunes handled requests, under which `ClusterCron` stores its own runs,
 * which it prunes too.
 *
 * @category utils
 * @since 0.1.0
 */
export const jobName = "amends/prune-handled-requests";

/**
 * Remove the handled messages of these entity types stored before `before`, with anything
 * Cluster kept for them, and return how many went; the host's storage knows how, such as
 * `PostgresClusterStorage.prune`.
 *
 * @category models
 * @since 0.1.0
 */
export type Prune<E, R> = (
  entityTypes: ReadonlyArray<string>,
  before: DateTime.Utc,
) => Effect.Effect<number, E, R>;

/**
 * Prune the handled requests of `entityTypes`, and the job's own past runs, once they are older
 * than `keep` (seven days by default), every hour on one runner of the cluster. By then a
 * request's key no longer needs to stop a repeat: nothing asks again days later. Requests not
 * yet handled are kept, however old.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = <E, R>(options: {
  readonly prune: Prune<E, R>;
  readonly entityTypes: ReadonlyArray<string>;
  readonly keep?: Duration.Input | undefined;
}) => {
  const keep = Duration.fromInputUnsafe(options.keep ?? "7 days");
  const entityTypes = [...options.entityTypes, `ClusterCron/${jobName}`];
  return ClusterCron.make({
    name: jobName,
    cron: Cron.parseUnsafe("0 * * * *"),
    execute: Effect.gen(function* () {
      const before = DateTime.subtractDuration(yield* DateTime.now, keep);
      const removed = yield* options.prune(entityTypes, before);
      if (removed > 0) yield* Effect.logInfo("Pruned handled Cluster requests", { removed });
    }),
  });
};
