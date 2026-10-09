/**
 * Turn jobs on Effect Cluster: one for each agent in each thread, an entity whose persisted
 * requests ask it to run the agent's work there or to stop its turn. A commit stores a request
 * with itself, and the runner that owns the entity handles it when it arrives. Cluster keeps an
 * entity on one runner at a time and redelivers a request whose handling was cut short, so a turn
 * cut short runs again. A request that fails is tried again where it is, after a delay that grows,
 * until it holds or has failed `maxFailures` times. The job's runs take turns, while a stop
 * reaches the run in progress.
 */
import { Store } from "@amends/core/journal";
import { ThreadId } from "@amends/core/thread";
import { Turn, TurnJobs } from "@amends/core/turn";
import { Member, Workspace } from "@amends/core/workspace";
import { Effect, Layer, Predicate, PrimaryKey, Ref, Schedule, Schema } from "effect";
import { ClusterSchema, Entity, Sharding } from "effect/cluster";
import { Rpc } from "effect/rpc";
import { TurnRunner } from "../turns/runner.ts";

/**
 * Which request this is among the job's: Cluster keeps one request per key, so a commit that asks
 * twice stores one.
 */
const keyed = { key: Schema.String };

/** A request to run the agent's next turn in the thread. */
export class Run extends Schema.Class<Run>("amends/TurnJob/Run")({
  ...TurnJobs.Job.fields,
  ...keyed,
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
}

/** A request to stop the turn, which was asked to stop or whose agent no longer takes part. */
export class Stop extends Schema.Class<Stop>("amends/TurnJob/Stop")({
  ...TurnJobs.Job.fields,
  ...keyed,
  turnId: Turn.Id,
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
}

/** An agent's work in one thread; its requests survive the runner. */
export const entity = Entity.make("amends/TurnJob", [
  Rpc.make("Run", { payload: Run }).annotate(ClusterSchema.Persisted, true),
  Rpc.make("Stop", { payload: Stop }).annotate(ClusterSchema.Persisted, true),
]);

/** The entity of a job. */
export const entityId = (job: TurnJobs.Job) =>
  JSON.stringify([job.workspaceId, job.memberId, job.threadId]);

const decodeEntityId = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Tuple([Workspace.Id, Member.Id, ThreadId.Id])),
);
/** The job an entity is. */
const jobOf = (entityId: string): TurnJobs.Job => {
  const [workspaceId, memberId, threadId] = decodeEntityId(entityId);
  return { workspaceId, memberId, threadId };
};

/** A request that fails this many times in a row is not tried again. */
export const maxFailures = 8;

/**
 * How long a request waits before it is tried again, after each failure: doubling from two
 * seconds, up to five minutes.
 */
export const retryDelays = Schedule.min([
  Schedule.exponential("2 seconds"),
  Schedule.spaced("5 minutes"),
]);

/** A request the job handles. */
export type Request = Run | Stop;

/** Whether a request failed because its workspace was never created. */
const isWorkspaceNotFound = (error: unknown) =>
  Predicate.isTagged(
    error instanceof TurnRunner.RunFailed ? error.cause : error,
    "Gateway.WorkspaceNotFound",
  );

/**
 * Requests stored by Cluster. Sent inside a commit, a request shares its transaction when Cluster's
 * message storage uses the same SQL client as the workspace's storage, so it commits or rolls back
 * with the commit; the host composing them owns that. Cluster looks for the request as it stores
 * it, before the commit can show it, so once the commit is done this runner reads storage again
 * rather than finding the request at its next poll.
 *
 * @category layers
 */
export const layerRequests = Layer.effect(
  TurnJobs.Service,
  Effect.gen(function* () {
    const sharding = yield* Sharding.Sharding;
    const turnJobClient = yield* entity.client;
    const failure = (cause: unknown) => new Store.Failure({ operation: "request turn job", cause });
    return TurnJobs.Service.of({
      requestRun: Effect.fnUntraced(function* ({ workspaceId, memberId, threadId }) {
        const storeTransaction = yield* Store.Transaction;
        const run = new Run({ workspaceId, memberId, threadId, key: `run:${storeTransaction.id}` });
        yield* turnJobClient(entityId(run))
          .Run(run, { discard: true })
          .pipe(Effect.mapError(failure));
        yield* storeTransaction.afterCommit(sharding.pollStorage);
      }),
      requestStop: Effect.fnUntraced(function* ({ workspaceId, memberId, threadId, turnId }) {
        const storeTransaction = yield* Store.Transaction;
        const stop = new Stop({
          workspaceId,
          memberId,
          threadId,
          turnId,
          key: `stop:${turnId}:${storeTransaction.id}`,
        });
        yield* turnJobClient(entityId(stop))
          .Stop(stop, { discard: true })
          .pipe(Effect.mapError(failure));
        yield* storeTransaction.afterCommit(sharding.pollStorage);
      }),
    });
  }),
);

/**
 * Handle each request when it arrives, through the job's turn runner: run the agent's next turn,
 * or stop its turn. A request that fails is tried again after `retryDelays`, until it holds or
 * has failed `maxFailures` times; then a run that accepted a turn gives the turn up, which is
 * tried until it holds, so a turn never stays active with nothing to run it, and any other request
 * is dropped, its work left for the next request to find. A request whose workspace was never
 * created is dropped at once. Failures are logged.
 *
 * @category layers
 */
export const layerWorker = entity.toLayer(
  Effect.gen(function* () {
    const job = jobOf((yield* Entity.CurrentAddress).entityId);
    const { workspaceId, memberId, threadId } = job;
    const turnRunner = yield* TurnRunner.make(job);
    /** What a log says of `request`: its job and key. */
    const named = (request: Request) => ({ workspaceId, memberId, threadId, request: request.key });

    /**
     * Do `work` for `request`, trying again after each failure, `times` more at most, as long as
     * its workspace exists. A failure that would have been a defect is one to try again like any
     * other, rather than one that restarts the entity.
     */
    const retrying = <A, E, R>(request: Request, work: Effect.Effect<A, E, R>, times?: number) =>
      work.pipe(
        Effect.catchDefect((defect) => Effect.fail(defect)),
        Effect.tapError((error) =>
          Effect.gen(function* () {
            // Each try runs with the schedule's metadata: how many tries came before it.
            const { attempt } = yield* Schedule.CurrentMetadata;
            yield* Effect.logWarning("Turn job request failed", {
              ...named(request),
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

    /** Leave the request's work for the next request to find, as it failed with `error` for good. */
    const drop = (request: Request, error: unknown) =>
      Effect.logError(
        isWorkspaceNotFound(error)
          ? "Turn job request dropped: its workspace was not found"
          : "Turn job request dropped: it kept failing",
        { ...named(request), error },
      );

    /** Give the turn up, as the request's runs kept failing to run it, trying until it holds. */
    const giveUp = (request: Run, turnId: Turn.Id) =>
      retrying(request, turnRunner.giveUp(turnId, "Its turn job kept failing to run it.")).pipe(
        Effect.catch((error) => drop(request, error)),
      );

    /**
     * Run the agent's next turn, trying again after each failed run until `maxFailures`. Then the
     * turn a run accepted, if one did, is given up, and otherwise the request is dropped.
     */
    const runNextTurn = Effect.fnUntraced(function* (request: Run) {
      /** The turn the runs accepted, once one did; a later run may fail before finding it again. */
      const accepted = yield* Ref.make<Turn.Id | undefined>(undefined);
      const run = turnRunner.runNextTurn.pipe(
        Effect.tapError((error) => Ref.update(accepted, (turnId) => error.turnId ?? turnId)),
      );
      yield* retrying(request, run, maxFailures - 1).pipe(
        Effect.catch(
          Effect.fnUntraced(function* (error) {
            const turnId = yield* Ref.get(accepted);
            if (turnId === undefined || isWorkspaceNotFound(error))
              return yield* drop(request, error);
            yield* giveUp(request, turnId);
          }),
        ),
      );
    });

    /** Stop the turn, trying again after each failure until `maxFailures`; then it is dropped. */
    const stopTurn = (request: Stop) =>
      retrying(request, turnRunner.stopTurn(request.turnId), maxFailures - 1).pipe(
        Effect.catch((error) => drop(request, error)),
      );

    return entity.of({
      Run: ({ payload: run }) => runNextTurn(run),
      Stop: ({ payload: stop }) => stopTurn(stop),
    });
  }),
  { concurrency: "unbounded", maxIdleTime: "1 minute" },
);

/** Stored requests and the worker that handles them, over the host's Cluster. @category layers */
export const layer = Layer.merge(layerWorker, layerRequests);

export * as TurnJob from "./turn-job.ts";
