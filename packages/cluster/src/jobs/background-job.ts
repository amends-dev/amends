/**
 * Background jobs on Effect Cluster: one per workspace and background process, an entity whose
 * persisted `Run` requests say when the process should run. A commit stores a request with itself,
 * and the runner that owns the entity runs the process when it arrives, then asks for the next run
 * from what the process left outstanding. Cluster keeps an entity on one runner at a time and
 * redelivers a request whose run was cut short, so a process runs one run at a time and resumes
 * after a restart.
 */
import { BackgroundJobs, BackgroundProcess } from "@amends/core/background";
import { Store } from "@amends/core/journal";
import { Workspace } from "@amends/core/workspace";
import { Gateway, WorkspaceBackgroundJobs } from "@amends/gateway";
import { Cause, Crypto, DateTime, Effect, Exit, Layer, Option, PrimaryKey, Schema } from "effect";
import { ClusterSchema, DeliverAt, Entity, Sharding } from "effect/unstable/cluster";
import { Rpc } from "effect/unstable/rpc";
import { JobRetry } from "./retry.ts";

/**
 * A request for a workspace's background process to run at `at`. Its key identifies it among the
 * job's requests: Cluster keeps one request per key, so a commit that asks twice, or runs that ask
 * for the same later time, store one request.
 */
export class Run extends Schema.Class<Run>("amends/BackgroundJob/Run")({
  workspaceId: Workspace.Id,
  process: BackgroundProcess.Name,
  key: Schema.String,
  at: Schema.DateTimeUtcFromMillis,
  /** Failed runs before this one, for its delay. */
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
 * A request the worker gave up on: its process is one this host does not run, even after retries,
 * or its workspace was never created. Cluster keeps it as the request's reply, where operators
 * find it until handled requests are pruned.
 */
export const droppedTag = "amends/BackgroundJob/Dropped";
export class Dropped extends Schema.TaggedError<Dropped>()(droppedTag, {
  reason: Schema.Literals(["unknown-process", "workspace-not-found"]),
  attempt: Schema.Int,
}) {}

/** One workspace's background process: its runs take turns, and its requests survive the runner. */
export const entity = Entity.make("amends/BackgroundJob", [
  Rpc.make("Run", { payload: Run, error: Dropped }).annotate(ClusterSchema.Persisted, true),
]);

/** The entity for a workspace's background process. */
export const entityId = (workspaceId: Workspace.Id, process: BackgroundProcess.Name) =>
  JSON.stringify([workspaceId, process]);

/** An unknown process is dropped after this many failed runs, as when its host no longer runs it. */
export const maxUnknownRuns = 10;

/**
 * Requests stored by Cluster. Sent inside a commit, a request shares its transaction when Cluster's
 * message storage uses the same SQL client as the workspace's storage, so it commits or rolls back
 * with the commit; the host composing them owns that. Cluster looks for the request as it stores
 * it, before the commit can show it, so once the commit is done the runner reads storage again
 * rather than finding the request at its next poll.
 *
 * @category layers
 */
export const layerRequests = Layer.effect(
  WorkspaceBackgroundJobs.Service,
  Effect.gen(function* () {
    const sharding = yield* Sharding.Sharding;
    const backgroundJobClient = yield* entity.client;
    return WorkspaceBackgroundJobs.Service.of({
      forWorkspace: (workspaceId) =>
        BackgroundJobs.Service.of({
          request: Effect.fnUntraced(function* (process, options = {}) {
            const storeTransaction = yield* Store.Transaction;
            const at = options.at ?? (yield* DateTime.now);
            const key =
              options.at === undefined
                ? `commit:${storeTransaction.id}`
                : `commit:${storeTransaction.id}@${DateTime.toEpochMillis(at)}`;
            yield* backgroundJobClient(entityId(workspaceId, process))
              .Run(new Run({ workspaceId, process, key, at, attempt: 0 }), { discard: true })
              .pipe(
                Effect.mapError(
                  (cause) => new Store.Failure({ operation: "request background job", cause }),
                ),
              );
            yield* storeTransaction.afterCommit(sharding.pollStorage);
          }),
        }),
    });
  }),
);

/**
 * Run each workspace's background process when a request arrives, through the gateway, then ask
 * for its next run: at once while more is outstanding, when it is next due, or after a delay when
 * it failed. A request it could not act on stays undelivered, so Cluster runs it again.
 *
 * @category layers
 */
export const layerWorker = entity.toLayer(
  Effect.gen(function* () {
    const gateway = yield* Gateway.Service;
    const backgroundJobClient = yield* entity.client;
    const crypto = yield* Crypto.Crypto;
    /** Ask for the process to run again at `at`, under `key`, after `attempt` failed runs. */
    const requestRun = Effect.fnUntraced(function* (
      run: Run,
      next: { readonly at: DateTime.Utc; readonly key: string; readonly attempt: number },
    ) {
      yield* backgroundJobClient(entityId(run.workspaceId, run.process))
        .Run(new Run({ workspaceId: run.workspaceId, process: run.process, ...next }), {
          discard: true,
        })
        .pipe(Effect.orDie);
    });
    /** A key no other request has: `prefix` and a random ID. */
    const freshKey = (prefix: string) =>
      Effect.map(Effect.orDie(crypto.randomUUIDv4), (id) => `${prefix}:${id}`);
    return entity.of({
      Run: ({ payload: run }) =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            gateway.runBackgroundProcess(run.workspaceId, run.process),
          );
          const now = yield* DateTime.now;
          if (Exit.isSuccess(exit)) {
            const outcome = exit.value;
            if (outcome._tag === "Continue")
              yield* requestRun(run, { at: now, key: yield* freshKey("more"), attempt: 0 });
            if (outcome._tag === "At") {
              // Runs that ask for the same later time share one request. A time this request or
              // the clock has reached may already have had its request, which the key would
              // repeat, so it takes a fresh one: the process may find work still due when its
              // clock lags.
              const reached = DateTime.max(run.at, now);
              const key = DateTime.isGreaterThan(outcome.at, reached)
                ? `due:${DateTime.toEpochMillis(outcome.at)}`
                : yield* freshKey("due");
              yield* requestRun(run, { at: outcome.at, key, attempt: 0 });
            }
            return;
          }
          const failure = Option.map(Cause.findErrorOption(exit.cause), (error) => error._tag);
          const notFound = Option.contains(failure, "Gateway.WorkspaceNotFound");
          const unknown = Option.contains(failure, "BackgroundRuns.Unknown");
          if (notFound || (unknown && run.attempt + 1 >= maxUnknownRuns)) {
            yield* Effect.logError("Background process dropped", {
              workspaceId: run.workspaceId,
              process: run.process,
              cause: exit.cause,
            });
            return yield* new Dropped({
              reason: notFound ? "workspace-not-found" : "unknown-process",
              attempt: run.attempt,
            });
          }
          const attempt = run.attempt + 1;
          yield* Effect.logWarning("Background process failed; running it again later", {
            workspaceId: run.workspaceId,
            process: run.process,
            attempt,
            cause: exit.cause,
          });
          yield* requestRun(run, {
            at: DateTime.addDuration(now, JobRetry.delay(attempt)),
            key: yield* freshKey("retry"),
            attempt,
          });
        }),
    });
  }),
  { maxIdleTime: "1 minute" },
);

/** Stored requests and the worker that runs them, over the host's Cluster. @category layers */
export const layer = Layer.merge(layerWorker, layerRequests);

export * as BackgroundJob from "./background-job.ts";
