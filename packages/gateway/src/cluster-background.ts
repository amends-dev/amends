/**
 * Background work on Effect Cluster. Each workspace's process is an entity whose persisted wakes
 * say when it should run: a commit stores one with itself, and the runner that owns the entity
 * runs the process when it arrives, then asks for the next run from what the process left
 * outstanding. Cluster keeps an entity on one runner at a time and redelivers a wake whose run
 * was cut short, so a process runs one run at a time and resumes after a restart.
 */
import { BackgroundProcess, BackgroundWakes } from "@amends/core/background";
import { Store } from "@amends/core/journal";
import { Workspace } from "@amends/core/workspace";
import {
  Cause,
  Cron,
  Crypto,
  DateTime,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  PrimaryKey,
  Schema,
} from "effect";
import { ClusterCron, ClusterSchema, DeliverAt, Entity, Sharding } from "effect/unstable/cluster";
import { Rpc } from "effect/unstable/rpc";
import { ClusterRetry } from "./cluster-retry.ts";
import { Gateway } from "./gateway.ts";
import { WorkspaceWakes } from "./wakes.ts";

/**
 * A request for a workspace's process to run at `at`. Its key identifies it among the process's
 * wakes: Cluster keeps one wake per key, so a commit's retry or a repeated schedule asks once.
 */
export class Wake extends Schema.Class<Wake>("amends/background/Wake")({
  workspaceId: Workspace.Id,
  process: BackgroundProcess.Name,
  key: Schema.String,
  at: Schema.DateTimeUtcFromMillis,
  /** Failed runs before this one, for its backoff. */
  attempt: Schema.Int,
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
  [DeliverAt.symbol]() {
    return this.at;
  }
}

/**
 * A wake the worker gave up on: its process is one this host does not run, even after retries,
 * or its workspace was never created. Cluster keeps it as the wake's reply, where operators find
 * it until handled wakes are pruned.
 */
export const droppedTag = "amends/background/Dropped";
export class Dropped extends Schema.TaggedError<Dropped>()(droppedTag, {
  reason: Schema.Literals(["unknown-process", "workspace-not-found"]),
  attempt: Schema.Int,
}) {}

/** One workspace's process: runs of it take turns, and its wakes survive the runner. */
export const WorkspaceProcess = Entity.make("amends/WorkspaceProcess", [
  Rpc.make("Wake", { payload: Wake, error: Dropped }).annotate(ClusterSchema.Persisted, true),
]);

/** The entity for a workspace's process. */
export const entityId = (workspaceId: Workspace.Id, process: BackgroundProcess.Name) =>
  JSON.stringify([workspaceId, process]);

/** An unknown process is dropped after this many failed runs, as when its host no longer runs it. */
export const unknownAttempts = 10;

/**
 * Wakes stored by Cluster. Sent inside a commit, a wake shares its transaction when Cluster's
 * message storage uses the same SQL client as the workspace's storage, so it commits or rolls
 * back with the commit; the host composing them owns that. Cluster looks for the wake as it
 * stores it, before the commit can show it, so once the commit is done the runner reads storage
 * again rather than finding the wake at its next poll.
 *
 * @category layers
 */
export const layerWakes = Layer.effect(
  WorkspaceWakes.Service,
  Effect.gen(function* () {
    const sharding = yield* Sharding.Sharding;
    const processClient = yield* WorkspaceProcess.client;
    return WorkspaceWakes.Service.of({
      forWorkspace: (workspaceId) =>
        BackgroundWakes.Service.of({
          request: Effect.fnUntraced(function* (process, options = {}) {
            const storeTransaction = yield* Store.Transaction;
            const at = options.at ?? (yield* DateTime.now);
            const key =
              options.at === undefined
                ? `commit:${storeTransaction.id}`
                : `commit:${storeTransaction.id}@${DateTime.toEpochMillis(at)}`;
            yield* processClient(entityId(workspaceId, process))
              .Wake(new Wake({ workspaceId, process, key, at, attempt: 0 }), { discard: true })
              .pipe(Effect.mapError((cause) => new Store.Failure({ operation: "wake", cause })));
            yield* storeTransaction.afterCommit(sharding.pollStorage);
          }),
        }),
    });
  }),
);

/**
 * Run each workspace process when its wake arrives, through the gateway, then ask for its next
 * run: at once while more is outstanding, when it is next due, or after a backoff when it failed.
 * A wake it could not act on stays undelivered, so Cluster runs it again.
 *
 * @category layers
 */
export const layerWorker = WorkspaceProcess.toLayer(
  Effect.gen(function* () {
    const gateway = yield* Gateway.Service;
    const processClient = yield* WorkspaceProcess.client;
    const crypto = yield* Crypto.Crypto;
    /** Ask for the woken process to run again at `at`, under `key`, after `attempt` failed runs. */
    const requestWake = Effect.fnUntraced(function* (
      wake: Wake,
      next: { readonly at: DateTime.Utc; readonly key: string; readonly attempt: number },
    ) {
      yield* processClient(entityId(wake.workspaceId, wake.process))
        .Wake(new Wake({ workspaceId: wake.workspaceId, process: wake.process, ...next }), {
          discard: true,
        })
        .pipe(Effect.orDie);
    });
    /** A key no other wake has: `prefix` and a random ID. */
    const freshKey = (prefix: string) =>
      Effect.map(Effect.orDie(crypto.randomUUIDv4), (id) => `${prefix}:${id}`);
    return WorkspaceProcess.of({
      Wake: ({ payload: wake }) =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(gateway.runBackground(wake.workspaceId, wake.process));
          const now = yield* DateTime.now;
          if (Exit.isSuccess(exit)) {
            const outcome = exit.value;
            if (outcome._tag === "Continue")
              yield* requestWake(wake, { at: now, key: yield* freshKey("more"), attempt: 0 });
            if (outcome._tag === "At") {
              // Runs that ask for the same later time share one wake. A time this wake or the clock
              // has reached may already have had its wake, which the key would repeat, so it
              // takes a fresh one: the process may find work still due when its clock lags.
              const reached = DateTime.max(wake.at, now);
              const key = DateTime.isGreaterThan(outcome.at, reached)
                ? `due:${DateTime.toEpochMillis(outcome.at)}`
                : yield* freshKey("due");
              yield* requestWake(wake, { at: outcome.at, key, attempt: 0 });
            }
            return;
          }
          const failure = Option.map(Cause.findErrorOption(exit.cause), (error) => error._tag);
          const notFound = Option.contains(failure, "Gateway.WorkspaceNotFound");
          const unknown = Option.contains(failure, "BackgroundRuns.Unknown");
          if (notFound || (unknown && wake.attempt + 1 >= unknownAttempts)) {
            yield* Effect.logError("Background process dropped", {
              workspaceId: wake.workspaceId,
              process: wake.process,
              cause: exit.cause,
            });
            return yield* new Dropped({
              reason: notFound ? "workspace-not-found" : "unknown-process",
              attempt: wake.attempt,
            });
          }
          const attempt = wake.attempt + 1;
          yield* Effect.logWarning("Background process failed; running it again later", {
            workspaceId: wake.workspaceId,
            process: wake.process,
            attempt,
            cause: exit.cause,
          });
          yield* requestWake(wake, {
            at: DateTime.addDuration(now, ClusterRetry.delay(attempt)),
            key: yield* freshKey("retry"),
            attempt,
          });
        }),
    });
  }),
  { maxIdleTime: "1 minute" },
);

/** Stored wakes and the worker that runs them, over the host's Cluster. @category layers */
export const layer = Layer.merge(layerWorker, layerWakes);

/** The name of the job that prunes handled wakes. */
export const pruningJobName = "amends/prune-wakes";

/**
 * Remove the handled messages of these entity types stored before `before`, with anything
 * Cluster kept for them, and return how many went; the host's storage knows how.
 */
export type Prune<E, R> = (
  entityTypes: ReadonlyArray<string>,
  before: DateTime.Utc,
) => Effect.Effect<number, E, R>;

/**
 * Prune handled wakes, and the job's own past runs, once they are older than `keep` (seven days
 * by default), every hour on one runner of the cluster. Cluster removes neither. A wake's key
 * then no longer stops a repeat, which no longer arises: commits are not retried days later.
 * `entityTypes` names other entities whose handled messages go the same way, such as turns'.
 *
 * @category layers
 */
export const layerPruning = <E, R>(options: {
  readonly prune: Prune<E, R>;
  readonly keep?: Duration.Input | undefined;
  readonly entityTypes?: ReadonlyArray<string> | undefined;
}) => {
  const keep = Duration.fromInputUnsafe(options.keep ?? "7 days");
  const entityTypes = [WorkspaceProcess.type, ...(options.entityTypes ?? [])];
  return ClusterCron.make({
    name: pruningJobName,
    cron: Cron.parseUnsafe("0 * * * *"),
    execute: Effect.gen(function* () {
      const before = DateTime.subtractDuration(yield* DateTime.now, keep);
      const removed = yield* options.prune(
        [...entityTypes, `ClusterCron/${pruningJobName}`],
        before,
      );
      if (removed > 0) yield* Effect.logInfo("Pruned handled background wakes", { removed });
    }),
  });
};

export * as ClusterBackground from "./cluster-background.ts";
