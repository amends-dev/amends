/**
 * Turn jobs on Effect Cluster: one for each agent in each thread, an entity whose persisted
 * requests ask it to run the agent's work there, to stop its turn, or to give up a turn its runs
 * kept failing. A commit stores a request with itself, and the runner that owns the entity handles
 * it when it arrives. Cluster keeps an entity on one runner at a time and redelivers a request whose
 * handling was cut short, so a turn cut short runs again. The job's runs take turns, while a stop
 * reaches the run in progress.
 */
import { Store } from "@amends/core/journal";
import { ThreadId } from "@amends/core/thread";
import { Turn, TurnJobs } from "@amends/core/turn";
import { Member, Workspace } from "@amends/core/workspace";
import {
  Cause,
  DateTime,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  PrimaryKey,
  Schema,
} from "effect";
import { ClusterSchema, DeliverAt, Entity, Sharding } from "effect/cluster";
import { Rpc } from "effect/rpc";
import { TurnRunner } from "../turns/runner.ts";
import { JobRetry } from "./retry.ts";

/**
 * When a request is to be handled, and which it is among the job's: Cluster keeps one request per
 * key, so a commit that asks twice, or a handler that asks again after a crash, stores one.
 */
const scheduling = {
  key: Schema.String,
  at: Schema.DateTimeUtcFromMillis,
  /** Failed attempts before this one, for its delay. */
  attempt: Schema.Int,
};

/**
 * A request to run the agent's next turn in the thread. One that runs again after failed runs
 * names the turn they ran, if they accepted one.
 */
export class Run extends Schema.Class<Run>("amends/TurnJob/Run")({
  ...TurnJobs.Job.fields,
  ...scheduling,
  turnId: Schema.optionalKey(Turn.Id),
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
  [DeliverAt.symbol]() {
    return this.at;
  }
}

/** A request to stop the turn, which was asked to stop or whose agent no longer takes part. */
export class Stop extends Schema.Class<Stop>("amends/TurnJob/Stop")({
  ...TurnJobs.Job.fields,
  ...scheduling,
  turnId: Turn.Id,
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
  [DeliverAt.symbol]() {
    return this.at;
  }
}

/** A request to fail the turn the job's runs kept failing to run. */
export class GiveUp extends Schema.Class<GiveUp>("amends/TurnJob/GiveUp")({
  ...TurnJobs.Job.fields,
  ...scheduling,
  turnId: Turn.Id,
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
  [DeliverAt.symbol]() {
    return this.at;
  }
}

/** An agent's work in one thread; its requests survive the runner. */
export const entity = Entity.make("amends/TurnJob", [
  Rpc.make("Run", { payload: Run }).annotate(ClusterSchema.Persisted, true),
  Rpc.make("Stop", { payload: Stop }).annotate(ClusterSchema.Persisted, true),
  Rpc.make("GiveUp", { payload: GiveUp }).annotate(ClusterSchema.Persisted, true),
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

/** A request the job handles. */
export type Request = Run | Stop | GiveUp;

/** What follows a request that failed. */
export type Next =
  | { readonly _tag: "Retry" }
  | { readonly _tag: "GiveUp"; readonly turnId: Turn.Id }
  | { readonly _tag: "Drop" };

/**
 * What follows `request` once it failed `failures` times in a row: it is tried again after a
 * delay, until `maxFailures`; then a run that ran `turnId` gives the turn up, and any other request
 * is dropped, its work left for the next request to find. Giving up is tried until it holds, so a
 * turn never stays active with nothing to run it.
 */
export const afterFailure = (
  request: Request,
  failures: number,
  turnId: Turn.Id | undefined,
): Next => {
  if (request instanceof GiveUp || failures < maxFailures) return { _tag: "Retry" };
  return request instanceof Run && turnId !== undefined
    ? { _tag: "GiveUp", turnId }
    : { _tag: "Drop" };
};

/** The error a request failed with, if it failed with one. */
const errorOf = (cause: Cause.Cause<unknown>) =>
  Option.getOrUndefined(Cause.findErrorOption(cause));

/** Whether a request failed because its workspace was never created. */
const isWorkspaceNotFound = (cause: Cause.Cause<unknown>) => {
  const error = errorOf(cause);
  const reason = error instanceof TurnRunner.RunFailed ? error.cause : error;
  return Predicate.isTagged(reason, "Gateway.WorkspaceNotFound");
};

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
        const run = new Run({
          workspaceId,
          memberId,
          threadId,
          key: `run:${storeTransaction.id}`,
          at: yield* DateTime.now,
          attempt: 0,
        });
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
          at: yield* DateTime.now,
          attempt: 0,
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
 * stop its turn, or give the turn up. A request that fails asks again for what `afterFailure`
 * decides, under a key made from its own, and a request whose workspace was never created is
 * dropped. Failures are logged.
 *
 * @category layers
 */
export const layerWorker = entity.toLayer(
  Effect.gen(function* () {
    const job = jobOf((yield* Entity.CurrentAddress).entityId);
    const { workspaceId, memberId, threadId } = job;
    const turnRunner = yield* TurnRunner.make(job);
    const client = (yield* entity.client)(entityId(job));
    const send = (request: Request) =>
      Effect.orDie(
        request instanceof Run
          ? client.Run(request, { discard: true })
          : request instanceof Stop
            ? client.Stop(request, { discard: true })
            : client.GiveUp(request, { discard: true }),
      );

    /** Ask again for what follows `request`, which failed with `cause` running `turnId`. */
    const askAgain = Effect.fnUntraced(function* (
      request: Request,
      cause: Cause.Cause<unknown>,
      turnId: Turn.Id | undefined,
    ) {
      // A runner shutting down leaves the request to Cluster, which delivers it again.
      if (Cause.hasInterruptsOnly(cause)) return yield* Effect.interrupt;
      const fields = { workspaceId, memberId, threadId, request: request.key };
      if (isWorkspaceNotFound(cause))
        return yield* Effect.logError(
          "Turn job request dropped: its workspace was not found",
          fields,
        );
      const failures = request.attempt + 1;
      const next = afterFailure(request, failures, turnId);
      yield* Effect.logWarning("Turn job request failed", {
        ...fields,
        failures,
        next: next._tag,
        cause,
      });
      const now = yield* DateTime.now;
      switch (next._tag) {
        case "Drop":
          return;
        case "GiveUp":
          return yield* send(
            new GiveUp({
              workspaceId,
              memberId,
              threadId,
              turnId: next.turnId,
              key: `${request.key}/give-up`,
              at: now,
              attempt: 0,
            }),
          );
        case "Retry": {
          const retry = {
            key: `${request.key}/retry-${failures}`,
            at: DateTime.addDuration(now, JobRetry.delay(failures)),
            attempt: failures,
          };
          if (request instanceof Run)
            return yield* send(
              new Run({
                workspaceId,
                memberId,
                threadId,
                ...retry,
                ...(turnId === undefined ? {} : { turnId }),
              }),
            );
          if (request instanceof Stop)
            return yield* send(
              new Stop({ workspaceId, memberId, threadId, ...retry, turnId: request.turnId }),
            );
          return yield* send(
            new GiveUp({ workspaceId, memberId, threadId, ...retry, turnId: request.turnId }),
          );
        }
      }
    });

    /** Handle `request` by `work`, asking again for what follows when it fails. */
    const handle = <E, R>(
      request: Request,
      work: Effect.Effect<unknown, E, R>,
      turnIdOf: (error: E | undefined) => Turn.Id | undefined,
    ) =>
      Effect.flatMap(Effect.exit(work), (exit) =>
        Exit.isSuccess(exit)
          ? Effect.void
          : askAgain(request, exit.cause, turnIdOf(errorOf(exit.cause) as E | undefined)),
      );

    return entity.of({
      Run: ({ payload: run }) =>
        handle(run, turnRunner.runNextTurn, (error) => error?.turnId ?? run.turnId),
      Stop: ({ payload: stop }) =>
        handle(stop, turnRunner.stopTurn(stop.turnId), () => stop.turnId),
      GiveUp: ({ payload: giveUp }) =>
        handle(
          giveUp,
          turnRunner.giveUp(giveUp.turnId, "Its turn job kept failing to run it."),
          () => giveUp.turnId,
        ),
    });
  }),
  { concurrency: "unbounded", maxIdleTime: "1 minute" },
);

/** Stored requests and the worker that handles them, over the host's Cluster. @category layers */
export const layer = Layer.merge(layerWorker, layerRequests);

export * as TurnJob from "./turn-job.ts";
